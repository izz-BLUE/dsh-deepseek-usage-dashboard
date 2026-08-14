/**
 * Daily statistics aggregation.
 *
 * All daily buckets are computed from stored integer rows in the
 * Asia/Shanghai time zone. `cacheHitRate` is hit / (hit + miss), reported as
 * `0..1` (or `null` while there is no input at all).
 */
import type { UsageRow } from './sqlite-store.ts';
/** One day's aggregated statistics (exact usage only, never estimates). */
export interface DailyStats {
    /** The Asia/Shanghai day key (YYYY-MM-DD). */
    date: string;
    cacheHitInputTokens: number;
    cacheMissInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalInputTokens: number;
    totalTokens: number;
    /** Rows recorded for the day (usage-bearing and failed requests). */
    requestCount: number;
    /** Requests that ended in error/abort without final usage. */
    failedRequestCount: number;
    /** hit / (hit + miss); null while there is no input. */
    cacheHitRate: number | null;
}
/** Aggregate one day's rows into {@link DailyStats}. */
export declare function aggregateDaily(date: string, rows: readonly UsageRow[]): DailyStats;
/** The empty statistics for one day. */
export declare function emptyDailyStats(date: string): DailyStats;
/** Render a cache-hit rate as a percentage string ("42.1%"; "--" when null). */
export declare function formatHitRate(rate: number | null): string;
//# sourceMappingURL=stats.d.ts.map