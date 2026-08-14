/**
 * Asia/Shanghai natural-day keying.
 *
 * Day keys are `YYYY-MM-DD` strings computed in the Asia/Shanghai time zone
 * (UTC+8, no DST since 1991). `Intl.DateTimeFormat` with an explicit
 * `timeZone` is the only timezone database available in every Node runtime
 * without shipping tz data, and it is exact for fixed-offset zones.
 */
/** The timezone every daily bucket is computed in. */
export const DAY_TIMEZONE = 'Asia/Shanghai';
/** Date-parts formatter reused by {@link dayKeyOf} and {@link dayRangeMs}. */
const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: DAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});
/** The UTC offset (milliseconds east of UTC) of Asia/Shanghai at one instant. */
function offsetMsAt(epochMs) {
    const parts = PARTS_FORMATTER.formatToParts(epochMs);
    const read = (type) => {
        const part = parts.find(item => item.type === type);
        return part === undefined ? 0 : Number.parseInt(part.value, 10);
    };
    // The formatter renders the wall clock in Asia/Shanghai; the difference to
    // the same instant in UTC is the offset at that instant.
    const wall = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
    return wall - epochMs;
}
/** Compute `YYYY-MM-DD` (Asia/Shanghai) for one epoch-millisecond instant. */
export function dayKeyOf(epochMs) {
    const parts = PARTS_FORMATTER.formatToParts(epochMs);
    const read = (type) => parts.find(item => item.type === type)?.value ?? '';
    return `${read('year')}-${read('month')}-${read('day')}`;
}
/** The inclusive [start, end) epoch-millisecond range of one Shanghai day. */
export function dayRangeMs(dayKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
    if (match === null)
        throw new Error(`deepseek-usage: invalid day key ${dayKey}`);
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    // UTC midnight of that date, shifted by Shanghai's offset at that moment.
    const utcMidnight = Date.UTC(year, month - 1, day);
    const startMs = utcMidnight - offsetMsAt(utcMidnight);
    return { startMs, endMs: startMs + 86_400_000 };
}
/** The previous calendar day's key in Asia/Shanghai. */
export function previousDayKey(dayKey) {
    const { startMs } = dayRangeMs(dayKey);
    return dayKeyOf(startMs - 1);
}
/** The next calendar day's key in Asia/Shanghai. */
export function nextDayKey(dayKey) {
    const { endMs } = dayRangeMs(dayKey);
    return dayKeyOf(endMs);
}
/** The last `count` day keys ending at (and including) `todayKey`. */
export function recentDayKeys(todayKey, count) {
    const keys = [];
    let cursor = todayKey;
    for (let i = 0; i < count; i += 1) {
        keys.unshift(cursor);
        cursor = previousDayKey(cursor);
    }
    return keys;
}
