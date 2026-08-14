/**
 * Daily statistics aggregation.
 *
 * All daily buckets are computed from stored integer rows in the
 * Asia/Shanghai time zone. `cacheHitRate` is hit / (hit + miss), reported as
 * `0..1` (or `null` while there is no input at all).
 */
/** Aggregate one day's rows into {@link DailyStats}. */
export function aggregateDaily(date, rows) {
    let cacheHit = 0;
    let cacheMiss = 0;
    let output = 0;
    let reasoning = 0;
    let failed = 0;
    for (const row of rows) {
        // Failed requests carry no usage by construction; even if a malformed
        // row carried tokens, a failed request's usage is unknown — never count
        // it into the exact buckets.
        if (!row.failed) {
            cacheHit += row.cacheHit;
            cacheMiss += row.cacheMiss;
            output += row.output;
            reasoning += row.reasoning;
        }
        if (row.failed)
            failed += 1;
    }
    const totalInput = cacheHit + cacheMiss;
    const denominator = cacheHit + cacheMiss;
    return {
        date,
        cacheHitInputTokens: cacheHit,
        cacheMissInputTokens: cacheMiss,
        outputTokens: output,
        reasoningTokens: reasoning,
        totalInputTokens: totalInput,
        totalTokens: totalInput + output,
        requestCount: rows.length,
        failedRequestCount: failed,
        cacheHitRate: denominator === 0 ? null : cacheHit / denominator,
    };
}
/** The empty statistics for one day. */
export function emptyDailyStats(date) {
    return {
        date,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalInputTokens: 0,
        totalTokens: 0,
        requestCount: 0,
        failedRequestCount: 0,
        cacheHitRate: null,
    };
}
/** Render a cache-hit rate as a percentage string ("42.1%"; "--" when null). */
export function formatHitRate(rate) {
    return rate === null ? '--' : `${(rate * 100).toFixed(1)}%`;
}
