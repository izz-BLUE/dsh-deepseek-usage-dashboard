/**
 * SQLite-backed usage store (the durable statistics).
 *
 * The runtime's SQLite capability is Node's built-in `node:sqlite`
 * (`DatabaseSync`, available in the Node 24 runtime without flags) — no
 * native npm dependency is required. The store is the single authority for
 * daily exact statistics; the projection is only the capture mechanism.
 *
 * Idempotency: `usage_rows` carries `PRIMARY KEY (session_id, turn, step)`
 * and every write is `INSERT OR IGNORE`, so projection replays, duplicate
 * streaming usage, restart re-scans, and duplicate event submissions can
 * never double-count. Money is never stored as floats — token counts are
 * integers and cost is derived on read with BigInt micro-unit arithmetic.
 *
 * Corruption recovery: every open runs `PRAGMA integrity_check`; a failed
 * database is moved aside (`.corrupt-<timestamp>`) and recreated, so a
 * damaged file degrades to an empty store instead of crashing the plugin.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import type { StepRecord } from './projection.ts'
import type { BalanceSnapshot } from './balance.ts'
import type { DailyStats } from './stats.ts'
import { aggregateDaily } from './stats.ts'
import { dayRangeMs } from './day.ts'

/** One persisted usage row (StepRecord plus the session it belongs to). */
export interface UsageRow extends StepRecord {
  sessionId: string
}

/** Outcome of one idempotent insert batch. */
export interface InsertOutcome {
  inserted: number
  ignored: number
}

/** The stored balance snapshot plus its fetch time. */
export interface StoredBalance {
  snapshot: BalanceSnapshot
  fetchedAtMs: number
}

/** Durable store of usage rows, balance snapshots, and plugin meta. */
export class UsageStore {
  private readonly db: DatabaseSync

  /**
   * Open (and if necessary create/migrate) the store at `dbPath`.
   * @param dbPath - absolute SQLite file path.
   */
  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = openWithRecovery(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.migrate()
  }

  /** Create the schema (idempotent). */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage_rows (
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        step INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        time_ms INTEGER NOT NULL,
        model TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT '',
        cache_hit INTEGER NOT NULL DEFAULT 0,
        cache_miss INTEGER NOT NULL DEFAULT 0,
        output INTEGER NOT NULL DEFAULT 0,
        reasoning INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, turn, step)
      );
      CREATE INDEX IF NOT EXISTS usage_rows_time ON usage_rows (time_ms);
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS balance_snapshots (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        fetched_at_ms INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `)
  }

  /**
   * Insert step records idempotently (INSERT OR IGNORE on the
   * (session_id, turn, step) primary key). Synchronous by design: the single
   * host process serializes every write on one connection, so concurrent
   * projections cannot interleave partial rows.
   * @param rows - records to insert.
   * @returns how many rows landed and how many were ignored as duplicates.
   */
  insertRows(rows: readonly UsageRow[]): InsertOutcome {
    if (rows.length === 0) return { inserted: 0, ignored: 0 }
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO usage_rows
        (session_id, turn, step, seq, time_ms, model, provider, cache_hit, cache_miss, output, reasoning, failed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    let inserted = 0
    for (const row of rows) {
      const result = statement.run(
        row.sessionId,
        row.turn,
        row.step,
        row.seq,
        row.time,
        row.model,
        row.provider,
        row.cacheHit,
        row.cacheMiss,
        row.output,
        row.reasoning,
        row.failed ? 1 : 0,
      )
      inserted += Number(result.changes)
    }
    return { inserted, ignored: rows.length - inserted }
  }

  /** Whether one exact step already has a row (idempotency probe). */
  hasRow(sessionId: string, turn: number, step: number): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM usage_rows WHERE session_id = ? AND turn = ? AND step = ?',
    ).get(sessionId, turn, step)
    return row !== undefined
  }

  /** Read every row in one Asia/Shanghai day's [start, end) range. */
  rowsInRange(startMs: number, endMs: number): UsageRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM usage_rows WHERE time_ms >= ? AND time_ms < ? ORDER BY time_ms, session_id',
    ).all(startMs, endMs) as Array<Record<string, unknown>>
    return rows.map(rowFromSql)
  }

  /** Read every row ever stored (tests and trend scans). */
  allRows(): UsageRow[] {
    const rows = this.db.prepare('SELECT * FROM usage_rows ORDER BY time_ms, session_id').all() as Array<Record<string, unknown>>
    return rows.map(rowFromSql)
  }

  /** Aggregate one day's rows into the daily statistics. */
  dailyStats(dayKey: string): DailyStats {
    const { startMs, endMs } = dayRangeMs(dayKey)
    return aggregateDaily(dayKey, this.rowsInRange(startMs, endMs))
  }

  /** The total number of stored rows (sanity/telemetry). */
  rowCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM usage_rows').get() as { count: number }
    return row.count
  }

  /** Read one meta string value. */
  metaGet(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  }

  /** Write one meta string value (upsert). */
  metaSet(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `).run(key, value)
  }

  /** Load the last good balance snapshot, or undefined when never fetched. */
  loadBalance(): StoredBalance | undefined {
    const row = this.db.prepare('SELECT payload, fetched_at_ms FROM balance_snapshots WHERE id = 1').get() as
      | { payload: string; fetched_at_ms: number }
      | undefined
    if (row === undefined) return undefined
    try {
      const parsed: unknown = JSON.parse(row.payload)
      return { snapshot: parsed as BalanceSnapshot, fetchedAtMs: row.fetched_at_ms }
    } catch {
      return undefined
    }
  }

  /** Persist the last good balance snapshot (single-row upsert). */
  saveBalance(snapshot: BalanceSnapshot, fetchedAtMs: number, status: string): void {
    this.db.prepare(`
      INSERT INTO balance_snapshots (id, payload, fetched_at_ms, status) VALUES (1, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, fetched_at_ms = excluded.fetched_at_ms, status = excluded.status
    `).run(JSON.stringify(snapshot), fetchedAtMs, status)
  }

  /** Close the database (plugin teardown). */
  close(): void {
    try {
      this.db.close()
    } catch {
      // Already closed.
    }
  }
}

/** Open the database, moving a corrupt file aside and starting fresh. */
function openWithRecovery(dbPath: string): DatabaseSync {
  let opened: DatabaseSync | undefined
  try {
    opened = new DatabaseSync(dbPath)
    const check = opened.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (check.integrity_check === 'ok') return opened
    opened.close()
    opened = undefined
    throw new Error(`integrity_check: ${check.integrity_check}`)
  } catch {
    // A corrupt file must be closed (Windows locks the handle) before it can
    // be moved aside; keep it for forensics, then recreate the database.
    try {
      opened?.close()
    } catch {
      // Already closed.
    }
    const corruptPath = `${dbPath}.corrupt-${Date.now()}`
    try {
      renameSync(dbPath, corruptPath)
    } catch {
      // The file may not exist yet — that is fine.
    }
    return new DatabaseSync(dbPath)
  }
}

/** Map one SQL row back to a UsageRow. */
function rowFromSql(row: Record<string, unknown>): UsageRow {
  return {
    sessionId: String(row.session_id),
    turn: Number(row.turn),
    step: Number(row.step),
    seq: Number(row.seq),
    time: Number(row.time_ms),
    model: String(row.model),
    provider: String(row.provider),
    cacheHit: Number(row.cache_hit),
    cacheMiss: Number(row.cache_miss),
    output: Number(row.output),
    reasoning: Number(row.reasoning),
    failed: Number(row.failed) === 1,
  }
}
