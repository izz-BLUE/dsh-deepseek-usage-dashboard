/**
 * Asia/Shanghai natural-day keying.
 *
 * Day keys are `YYYY-MM-DD` strings computed in the Asia/Shanghai time zone
 * (UTC+8, no DST since 1991). `Intl.DateTimeFormat` with an explicit
 * `timeZone` is the only timezone database available in every Node runtime
 * without shipping tz data, and it is exact for fixed-offset zones.
 */
/** The timezone every daily bucket is computed in. */
export declare const DAY_TIMEZONE = "Asia/Shanghai";
/** Compute `YYYY-MM-DD` (Asia/Shanghai) for one epoch-millisecond instant. */
export declare function dayKeyOf(epochMs: number): string;
/** The inclusive [start, end) epoch-millisecond range of one Shanghai day. */
export declare function dayRangeMs(dayKey: string): {
    startMs: number;
    endMs: number;
};
/** The previous calendar day's key in Asia/Shanghai. */
export declare function previousDayKey(dayKey: string): string;
/** The next calendar day's key in Asia/Shanghai. */
export declare function nextDayKey(dayKey: string): string;
/** The last `count` day keys ending at (and including) `todayKey`. */
export declare function recentDayKeys(todayKey: string, count: number): string[];
//# sourceMappingURL=day.d.ts.map