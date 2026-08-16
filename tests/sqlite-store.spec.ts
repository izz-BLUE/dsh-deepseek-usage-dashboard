/**
 * SQLite store: idempotent inserts (UNIQUE constraint), restart recovery,
 * concurrent session writes, daily aggregation, meta, balance persistence,
 * and corruption recovery.
 */

import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UsageStore, type UsageRow } from '../src/core/sqlite-store.ts'

let dir: string
let store: UsageStore

/** One usage row for a session. */
function row(partial: Partial<UsageRow> & { sessionId: string; turn: number; step: number }): UsageRow {
  return {
    seq: 1,
    time: Date.UTC(2026, 0, 1, 8, 0, 0),
    requestTime: Date.UTC(2026, 0, 1, 8, 0, 0),
    model: 'deepseek-chat',
    provider: 'deepseek-official',
    cacheHit: 0,
    cacheMiss: 0,
    output: 0,
    reasoning: 0,
    failed: false,
    ...partial,
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-usage-store-'))
  store = new UsageStore(join(dir, 'usage.db'))
})

afterEach(() => {
  store.close()
})

describe('inserts and the UNIQUE constraint', () => {
  it('inserts rows and reads them back', () => {
    const outcome = store.insertRows([row({ sessionId: 's1', turn: 0, step: 0, cacheHit: 30, cacheMiss: 70, output: 20 })])
    expect(outcome).toEqual({ inserted: 1, ignored: 0 })
    expect(store.rowCount()).toBe(1)
    const rows = store.allRows()
    expect(rows[0]).toMatchObject({ sessionId: 's1', turn: 0, step: 0, cacheHit: 30, cacheMiss: 70, output: 20 })
  })

  it('ignores duplicate (sessionId, turn, step) — the idempotency backstop', () => {
    const base = row({ sessionId: 's1', turn: 0, step: 0, output: 20 })
    expect(store.insertRows([base]).inserted).toBe(1)
    // Duplicate streaming usage arrival: same key, different values.
    expect(store.insertRows([{ ...base, output: 999, seq: 7 }])).toEqual({ inserted: 0, ignored: 1 })
    expect(store.allRows()[0].output).toBe(20) // first write wins
    expect(store.hasRow('s1', 0, 0)).toBe(true)
    expect(store.hasRow('s1', 0, 1)).toBe(false)
  })

  it('treats the same step of DIFFERENT sessions as distinct rows', () => {
    store.insertRows([
      row({ sessionId: 's1', turn: 0, step: 0, output: 1 }),
      row({ sessionId: 's2', turn: 0, step: 0, output: 2 }),
    ])
    expect(store.rowCount()).toBe(2)
  })
})

describe('restart recovery', () => {
  it('retains rows across close + reopen (plugin restart)', () => {
    store.insertRows([row({ sessionId: 's1', turn: 0, step: 0, output: 20 })])
    store.close()
    store = new UsageStore(join(dir, 'usage.db'))
    expect(store.rowCount()).toBe(1)
    expect(store.allRows()[0].output).toBe(20)
    // Re-scanning the same events after restart inserts nothing new.
    expect(store.insertRows([row({ sessionId: 's1', turn: 0, step: 0, output: 20 })])).toEqual({ inserted: 0, ignored: 1 })
  })
})

describe('concurrent session writes', () => {
  it('serializes interleaved inserts from many sessions without loss', async () => {
    const batches = Array.from({ length: 20 }, (_, session) =>
      Array.from({ length: 10 }, (_, step) => row({ sessionId: `s${session}`, turn: 0, step, output: step })))
    // Fire all batches concurrently (the store serializes internally).
    await Promise.all(batches.map(rows => Promise.resolve().then(() => store.insertRows(rows))))
    expect(store.rowCount()).toBe(200)
  })
})

describe('daily aggregation', () => {
  it('aggregates one day and excludes other days', () => {
    const inDay = row({ sessionId: 's1', turn: 0, step: 0, time: Date.UTC(2026, 0, 2, 2, 0, 0), cacheHit: 30, cacheMiss: 70, output: 20, reasoning: 5 })
    const failed = row({ sessionId: 's1', turn: 1, step: 0, time: Date.UTC(2026, 0, 2, 3, 0, 0), failed: true })
    // 2026-01-03 01:00Z is still Shanghai 2026-01-03 09:00 (same day ok), but
    // this one is deliberately outside the 2026-01-02 Shanghai day:
    const otherDay = row({ sessionId: 's1', turn: 2, step: 0, time: Date.UTC(2026, 0, 3, 17, 0, 0), output: 999 })
    store.insertRows([inDay, failed, otherDay])
    const stats = store.dailyStats('2026-01-02')
    expect(stats.date).toBe('2026-01-02')
    expect(stats.cacheHitInputTokens).toBe(30)
    expect(stats.cacheMissInputTokens).toBe(70)
    expect(stats.outputTokens).toBe(20)
    expect(stats.reasoningTokens).toBe(5)
    expect(stats.totalInputTokens).toBe(100)
    expect(stats.totalTokens).toBe(120)
    expect(stats.requestCount).toBe(2)
    expect(stats.failedRequestCount).toBe(1)
    expect(stats.cacheHitRate).toBeCloseTo(0.3, 10)
  })
})

describe('meta and balance persistence', () => {
  it('round-trips meta values', () => {
    expect(store.metaGet('pricesVersion')).toBeUndefined()
    store.metaSet('pricesVersion', '2')
    expect(store.metaGet('pricesVersion')).toBe('2')
    store.metaSet('pricesVersion', '3')
    expect(store.metaGet('pricesVersion')).toBe('3')
  })

  it('round-trips the balance snapshot across reopen', () => {
    const snapshot = { isAvailable: true, infos: [{ currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.00', toppedUpBalance: '10.34' }] }
    store.saveBalance(snapshot, 1234567, 'ok')
    store.close()
    store = new UsageStore(join(dir, 'usage.db'))
    const stored = store.loadBalance()
    expect(stored?.snapshot).toEqual(snapshot)
    expect(stored?.fetchedAtMs).toBe(1234567)
  })
})

describe('request_time_ms (time-aware pricing column)', () => {
  it('creates request_time_ms in a fresh schema and round-trips requestTime', () => {
    const inserted = row({ sessionId: 's1', turn: 0, step: 0, time: 1000, requestTime: 900, output: 5 })
    expect(store.insertRows([inserted]).inserted).toBe(1)
    const stored = store.allRows()[0]!
    expect(stored.requestTime).toBe(900)
    expect(stored.time).toBe(1000)
  })

  it('migrates an old-schema database: adds the column and backfills request_time_ms = time_ms', () => {
    const dbPath = join(dir, 'usage.db')
    store.close()
    // Build a pre-migration database by hand (the column does not exist).
    const old = new UsageStore(dbPath)
    old.metaSet('probe', 'old-schema')
    old.close()
    const raw = new DatabaseSync(dbPath)
    raw.exec(`
      DROP TABLE usage_rows;
      CREATE TABLE usage_rows (
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
      INSERT INTO usage_rows (session_id, turn, step, seq, time_ms, model, provider, cache_hit, cache_miss, output, reasoning, failed)
      VALUES ('old-s1', 0, 0, 1, 1234567, 'deepseek-chat', 'deepseek-official', 1, 2, 3, 4, 0),
             ('old-s1', 0, 1, 2, 7654321, 'deepseek-chat', 'deepseek-official', 0, 0, 0, 0, 1);
    `)
    raw.close()
    // Reopening with the current store migrates in place (no data loss).
    store = new UsageStore(dbPath)
    expect(store.rowCount()).toBe(2)
    const rows = store.allRows()
    expect(rows.map(item => item.requestTime).sort()).toEqual([1234567, 7654321]) // backfilled from time_ms
    expect(rows[0]!.time).toBe(1234567)
    expect(rows[1]!.failed).toBe(true)
    // New rows written after migration carry their real requestTime.
    store.insertRows([row({ sessionId: 'old-s1', turn: 1, step: 0, time: 2000, requestTime: 1500 })])
    expect(store.allRows().find(item => item.turn === 1)!.requestTime).toBe(1500)
    // meta survived the migration.
    expect(store.metaGet('probe')).toBe('old-schema')
  })

  it('keeps idempotency intact with requestTime (first write wins)', () => {
    const base = row({ sessionId: 's1', turn: 0, step: 0, requestTime: 900, output: 20 })
    expect(store.insertRows([base]).inserted).toBe(1)
    expect(store.insertRows([{ ...base, requestTime: 950, output: 999 }])).toEqual({ inserted: 0, ignored: 1 })
    expect(store.allRows()[0]!.requestTime).toBe(900)
  })
})

describe('corruption recovery', () => {
  it('moves a damaged database aside and starts fresh', () => {
    const dbPath = join(dir, 'usage.db')
    store.close()
    writeFileSync(dbPath, 'this is not a sqlite database at all')
    store = new UsageStore(dbPath)
    expect(store.rowCount()).toBe(0)
    store.insertRows([row({ sessionId: 's1', turn: 0, step: 0 })])
    expect(store.rowCount()).toBe(1)
    // The damaged file was preserved for forensics under a .corrupt- suffix.
    const aside = readdirSync(dir).find(name => name.startsWith('usage.db.corrupt-'))
    expect(aside).toBeDefined()
    expect(readFileSync(join(dir, aside!), 'utf8')).toContain('not a sqlite database')
  })
})
