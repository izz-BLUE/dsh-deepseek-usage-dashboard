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
/**
 * Date-parts formatter for one timezone. `Intl.DateTimeFormat` with an
 * explicit `timeZone` is the only timezone database available in every Node
 * runtime without shipping tz data, and it is exact for fixed-offset zones.
 * Formatters are cached per timezone (the number of distinct zones in a
 * pricing config is tiny).
 */
const FORMATTER_CACHE = new Map();
function partsFormatter(timezone) {
    let formatter = FORMATTER_CACHE.get(timezone);
    if (formatter === undefined) {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        FORMATTER_CACHE.set(timezone, formatter);
    }
    return formatter;
}
/** Parse one instant's wall clock in `timezone` (formatter-based). */
function wallClockAt(epochMs, timezone) {
    const parts = partsFormatter(timezone).formatToParts(epochMs);
    const read = (type) => {
        const part = parts.find(item => item.type === type);
        return part === undefined ? 0 : Number.parseInt(part.value, 10);
    };
    return {
        year: read('year'),
        month: read('month'),
        day: read('day'),
        hour: read('hour'),
        minute: read('minute'),
        second: read('second'),
    };
}
/** The UTC offset (milliseconds east of UTC) of `timezone` at one instant. */
export function timezoneOffsetMs(epochMs, timezone) {
    const clock = wallClockAt(epochMs, timezone);
    // The formatter renders the wall clock in `timezone`; the difference to
    // the same instant in UTC is the offset at that instant.
    const wall = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
    return wall - epochMs;
}
/** The UTC offset (milliseconds east of UTC) of Asia/Shanghai at one instant. */
function offsetMsAt(epochMs) {
    return timezoneOffsetMs(epochMs, DAY_TIMEZONE);
}
/** Compute `YYYY-MM-DD` (Asia/Shanghai) for one epoch-millisecond instant. */
export function dayKeyOf(epochMs) {
    const clock = wallClockAt(epochMs, DAY_TIMEZONE);
    return `${String(clock.year).padStart(4, '0')}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`;
}
/** The inclusive [start, end) epoch-millisecond range of one Shanghai day. */
export function dayRangeMs(dayKey) {
    return dayRangeMsInTimezone(dayKey, DAY_TIMEZONE);
}
/** The inclusive [start, end) epoch-millisecond range of one `timezone` day. */
export function dayRangeMsInTimezone(dayKey, timezone) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
    if (match === null)
        throw new Error(`deepseek-usage: invalid day key ${dayKey}`);
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    // UTC midnight of that date, shifted by the zone's offset at that moment.
    const utcMidnight = Date.UTC(year, month - 1, day);
    const startMs = utcMidnight - timezoneOffsetMs(utcMidnight, timezone);
    return { startMs, endMs: startMs + 86_400_000 };
}
/** The minute-of-day (0..1439) of one instant in `timezone`. */
export function minuteOfDayInTimezone(epochMs, timezone) {
    const clock = wallClockAt(epochMs, timezone);
    return clock.hour * 60 + clock.minute;
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
