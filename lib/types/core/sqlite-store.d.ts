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
import type { StepRecord } from './projection.ts';
import type { BalanceSnapshot } from './balance.ts';
import type { DailyStats } from './stats.ts';
/** One persisted usage row (StepRecord plus the session it belongs to). */
export interface UsageRow extends StepRecord {
    sessionId: string;
}
/** Outcome of one idempotent insert batch. */
export interface InsertOutcome {
    inserted: number;
    ignored: number;
}
/** The stored balance snapshot plus its fetch time. */
export interface StoredBalance {
    snapshot: BalanceSnapshot;
    fetchedAtMs: number;
}
/** Durable store of usage rows, balance snapshots, and plugin meta. */
export declare class UsageStore {
    private readonly db;
    /**
     * Open (and if necessary create/migrate) the store at `dbPath`.
     * @param dbPath - absolute SQLite file path.
     */
    constructor(dbPath: string);
    /** Create the schema (idempotent). */
    private migrate;
    /**
     * Insert step records idempotently (INSERT OR IGNORE on the
     * (session_id, turn, step) primary key). Synchronous by design: the single
     * host process serializes every write on one connection, so concurrent
     * projections cannot interleave partial rows.
     * @param rows - records to insert.
     * @returns how many rows landed and how many were ignored as duplicates.
     */
    insertRows(rows: readonly UsageRow[]): InsertOutcome;
    /** Whether one exact step already has a row (idempotency probe). */
    hasRow(sessionId: string, turn: number, step: number): boolean;
    /** Read every row in one Asia/Shanghai day's [start, end) range. */
    rowsInRange(startMs: number, endMs: number): UsageRow[];
    /** Read every row ever stored (tests and trend scans). */
    allRows(): UsageRow[];
    /** Aggregate one day's rows into the daily statistics. */
    dailyStats(dayKey: string): DailyStats;
    /** The total number of stored rows (sanity/telemetry). */
    rowCount(): number;
    /** Read one meta string value. */
    metaGet(key: string): string | undefined;
    /** Write one meta string value (upsert). */
    metaSet(key: string, value: string): void;
    /** Load the last good balance snapshot, or undefined when never fetched. */
    loadBalance(): StoredBalance | undefined;
    /** Persist the last good balance snapshot (single-row upsert). */
    saveBalance(snapshot: BalanceSnapshot, fetchedAtMs: number, status: string): void;
    /** Close the database (plugin teardown). */
    close(): void;
}
//# sourceMappingURL=sqlite-store.d.ts.map