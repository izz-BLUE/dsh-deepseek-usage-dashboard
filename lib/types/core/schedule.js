/**
 * Time-aware pricing schedules (the Phase-1 pricing engine).
 *
 * A {@link PricingSchedule} is a versioned price table bound to an explicit
 * effective instant, priced in ONE currency, split into daily time bands
 * (windows). Every usage row is priced by the schedule that was effective AT
 * THE REQUEST TIME:
 *
 *   schedule.effectiveFrom <= requestTime   (inclusive boundary)
 *
 * so a later price change never reprices history, and a request that started
 * before a midnight boundary is priced under the OLD schedule even when its
 * usage settles after the boundary.
 *
 * Band resolution: a request's wall clock (in the schedule's own timezone,
 * never the system local zone) is matched against the schedule's windows —
 * `start` inclusive, `end` exclusive. Unmatched minutes fall into the
 * implicit `off-peak` band, so a schedule may declare only its peak windows.
 * A window with `start === end` covers the whole day (all-day schedule).
 *
 * Unknown models are a NORMAL, expressible state: without an explicit user
 * configured `*` (wildcard) model entry the resolver returns `unpriced`
 * instead of inventing a price, and the dashboard shows the estimate with a
 * "partly unpriced" marker rather than a false exact number.
 *
 * Several windows may SHARE one band: a window's optional `bandId` names the
 * band its rates are keyed under (defaults to the window id). The official
 * 2026-08-17 schedule uses this to express `peak-morning` + `peak-afternoon`
 * as one `peak` band, so the peak rates are written exactly once.
 *
 * Ship here: the legacy 2026-04-24 table ({@link LEGACY_SCHEDULE}) and the
 * official DeepSeek 2026-08-17 table ({@link DEEPSEEK_2026_08_17_SCHEDULE}),
 * both as {@link DEFAULT_SCHEDULES}. The resolver itself is schedule-agnostic.
 */
import { formatMicro } from "./money.js";
import { costOfBuckets } from "./pricing.js";
import { dayRangeMsInTimezone, minuteOfDayInTimezone, timezoneOffsetMs } from "./day.js";
/** The implicit band for minutes not covered by any declared window. */
export const OFF_PEAK_BAND_ID = 'off-peak';
/** A window whose `start === end` covers the full day (all-day schedule). */
export const ALL_DAY_WINDOW_ID = 'all-day';
/** The default timezone for schedules and legacy normalization. */
export const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Shanghai';
/** Parse "HH:MM" into minutes of day; "24:00" (end only) becomes 1440. */
function parseMinuteOfDay(text, what) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (match === null)
        throw new Error(`deepseek-usage: ${what} must be "HH:MM", got "${text}"`);
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (minutes > 59)
        throw new Error(`deepseek-usage: ${what} minutes out of range in "${text}"`);
    const value = hours * 60 + minutes;
    if (value < 0 || value > 1440)
        throw new Error(`deepseek-usage: ${what} out of range in "${text}"`);
    return value;
}
/** Whether one minute-of-day falls inside one window (start inclusive, end exclusive). */
export function isInsideWindow(minuteOfDay, window) {
    const start = parseMinuteOfDay(window.start, `window ${window.id} start`);
    const end = parseMinuteOfDay(window.end, `window ${window.id} end`);
    if (start === end)
        return true; // all-day
    if (end > start)
        return minuteOfDay >= start && minuteOfDay < end;
    return minuteOfDay >= start || minuteOfDay < end; // cross-midnight
}
/** The band id covering one minute of day (a window's band, or implicit off-peak). */
export function bandForMinute(schedule, minuteOfDay) {
    for (const window of schedule.windows) {
        if (isInsideWindow(minuteOfDay, window))
            return { bandId: window.bandId ?? window.id, window };
    }
    return { bandId: OFF_PEAK_BAND_ID, window: null };
}
/** Render a minute-of-day as "HH:MM" (1440 renders as "24:00"). */
export function formatMinuteOfDay(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
/**
 * The off-peak (complement) spans of a schedule as [start, end) minute
 * pairs — every minute outside the declared windows. An all-day window
 * yields no spans. Used for band display; validation guarantees the
 * declared windows never overlap.
 */
export function offPeakSpans(schedule) {
    const covered = [];
    for (const window of schedule.windows) {
        for (const interval of windowIntervals(window))
            covered.push(interval);
    }
    covered.sort((a, b) => a[0] - b[0]);
    const spans = [];
    let cursor = 0;
    for (const [start, end] of covered) {
        if (start > cursor)
            spans.push({ start: cursor, end: start });
        if (end > cursor)
            cursor = end;
    }
    if (cursor < 1440)
        spans.push({ start: cursor, end: 1440 });
    return spans;
}
/** The off-peak span containing one minute of day, or null inside a window. */
export function offPeakSpanForMinute(schedule, minuteOfDay) {
    return offPeakSpans(schedule).find(span => minuteOfDay >= span.start && minuteOfDay < span.end) ?? null;
}
/** Whether a value is an ISO 8601 instant with an explicit offset/Z designator. */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** A legacy `YYYY-MM-DD` date (interpreted as midnight in the timezone). */
const LEGACY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Render an offset as `±HH:MM` (milliseconds east of UTC). */
function formatOffset(offsetMs) {
    const sign = offsetMs < 0 ? '-' : '+';
    const absolute = Math.abs(offsetMs);
    const hours = Math.floor(absolute / 3_600_000);
    const minutes = Math.floor((absolute % 3_600_000) / 60_000);
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
/**
 * Normalize an `effectiveFrom` value into an ISO 8601 instant with offset.
 * A legacy `YYYY-MM-DD` becomes midnight in `timezone` (e.g.
 * `2026-04-24T00:00:00+08:00`), so existing configs keep working unchanged.
 */
export function normalizeEffectiveFrom(value, timezone) {
    const trimmed = value.trim();
    if (LEGACY_DATE_RE.test(trimmed)) {
        // `dayRangeMsInTimezone`'s startMs IS midnight of that date; its wall
        // clock in `timezone` is exactly 00:00:00, so the instant can be
        // rendered as the date itself plus the zone's offset at that moment.
        const startMs = dayRangeMsInTimezone(trimmed, timezone).startMs;
        return `${trimmed}T00:00:00${formatOffset(timezoneOffsetMs(startMs, timezone))}`;
    }
    if (!ISO_INSTANT_RE.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
        throw new Error(`deepseek-usage: effectiveFrom "${value}" must be YYYY-MM-DD or an ISO 8601 instant with offset`);
    }
    return trimmed;
}
/** The epoch-millisecond instant a schedule becomes effective (inclusive). */
export function effectiveFromEpochMs(schedule) {
    const parsed = Date.parse(normalizeEffectiveFrom(schedule.effectiveFrom, schedule.timezone));
    if (Number.isNaN(parsed)) {
        throw new Error(`deepseek-usage: schedule ${schedule.id} has an invalid effectiveFrom "${schedule.effectiveFrom}"`);
    }
    return parsed;
}
/**
 * Sort and precompute the effective instants of a schedule list. The
 * resolved schedule for a request is the one with the largest
 * `effectiveFrom <= requestTime` — later schedules never reprice earlier
 * requests, because the list is only ever scanned up to the request time.
 */
export function prepareScheduleSet(schedules) {
    return schedules
        .map(schedule => ({ schedule, effectiveMs: effectiveFromEpochMs(schedule) }))
        .sort((a, b) => a.effectiveMs - b.effectiveMs);
}
/**
 * Resolve the pricing of one model at one request instant.
 *
 * Selection: schedules with `effectiveFrom <= requestTime`, taking the
 * LATEST one; the request's wall clock in the schedule's timezone picks the
 * band; then an exact model match, then an EXPLICIT user `*` wildcard. Any
 * other outcome is `unpriced` — never thrown, never a silent fake number.
 */
export function resolvePricing(prepared, model, requestTimeMs) {
    let schedule;
    for (const candidate of prepared) {
        if (candidate.effectiveMs <= requestTimeMs)
            schedule = candidate;
        else
            break; // sorted ascending; later schedules are not effective yet
    }
    if (schedule === undefined)
        return { status: 'unpriced', model, reason: 'no-schedule' };
    const { bandId } = bandForMinute(schedule.schedule, minuteOfDayInTimezone(requestTimeMs, schedule.schedule.timezone));
    const entry = schedule.schedule.models.find(item => item.model === model)
        ?? schedule.schedule.models.find(item => item.model === '*');
    if (entry === undefined)
        return { status: 'unpriced', model, reason: 'unknown-model' };
    const rates = entry.ratesByBand[bandId];
    if (rates === undefined)
        return { status: 'unpriced', model, reason: 'no-rates-for-band' };
    return {
        status: 'priced',
        scheduleId: schedule.schedule.id,
        effectiveFrom: schedule.schedule.effectiveFrom,
        timezone: schedule.schedule.timezone,
        bandId,
        model,
        currency: schedule.schedule.currency,
        rates,
    };
}
/** Validate one rates object (non-negative finite numbers). */
function assertValidRates(rates, where) {
    for (const [name, value] of [
        ['cacheHitInputPricePerMillion', rates.cacheHitInputPricePerMillion],
        ['cacheMissInputPricePerMillion', rates.cacheMissInputPricePerMillion],
        ['outputPricePerMillion', rates.outputPricePerMillion],
    ]) {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`deepseek-usage: ${where} ${name} must be a non-negative number`);
        }
    }
}
/** The minute-of-day intervals one window covers (cross-midnight splits). */
function windowIntervals(window) {
    const start = parseMinuteOfDay(window.start, `window ${window.id} start`);
    const end = parseMinuteOfDay(window.end, `window ${window.id} end`);
    if (start === end)
        return [[0, 1440]]; // all-day
    if (end > start)
        return [[start, end]];
    return [[start, 1440], [0, end]];
}
/** Validate the whole schedule set; throws with a specific message. */
export function validatePricingScheduleSet(set) {
    if (set.schedules.length === 0)
        throw new Error('deepseek-usage: pricingSchedules must contain at least one schedule');
    const seenIds = new Set();
    const seenEffective = new Set();
    let currency;
    for (const schedule of set.schedules) {
        if (schedule.id.trim() === '')
            throw new Error('deepseek-usage: every pricing schedule needs a non-empty id');
        if (seenIds.has(schedule.id))
            throw new Error(`deepseek-usage: duplicate pricing schedule id "${schedule.id}"`);
        seenIds.add(schedule.id);
        if (schedule.currency.trim() === '')
            throw new Error(`deepseek-usage: schedule ${schedule.id} has an empty currency`);
        // One schedule set must share ONE currency — mixed currencies would
        // silently sum into a single ¥ figure, which is never valid.
        if (currency === undefined)
            currency = schedule.currency;
        else if (currency !== schedule.currency) {
            throw new Error(`deepseek-usage: schedule ${schedule.id} uses ${schedule.currency} but the set is priced in ${currency}; mixed currencies are not supported`);
        }
        const effectiveMs = effectiveFromEpochMs(schedule);
        if (seenEffective.has(effectiveMs)) {
            throw new Error(`deepseek-usage: schedules ${schedule.id} and a sibling share the same effectiveFrom instant`);
        }
        seenEffective.add(effectiveMs);
        if (schedule.windows.length === 0) {
            throw new Error(`deepseek-usage: schedule ${schedule.id} needs at least one window (use start "00:00" end "00:00" for all-day)`);
        }
        const windowIds = new Set();
        const bandIds = new Set();
        const intervals = [];
        for (const window of schedule.windows) {
            if (window.id.trim() === '')
                throw new Error(`deepseek-usage: schedule ${schedule.id} has a window with an empty id`);
            if (windowIds.has(window.id))
                throw new Error(`deepseek-usage: schedule ${schedule.id} has duplicate window id "${window.id}"`);
            windowIds.add(window.id);
            const bandId = window.bandId ?? window.id;
            if (bandId.trim() === '')
                throw new Error(`deepseek-usage: schedule ${schedule.id} window ${window.id} has an empty bandId`);
            bandIds.add(bandId);
            const parts = windowIntervals(window); // throws on malformed times
            for (const interval of parts)
                intervals.push(interval);
        }
        // Overlap check on minute granularity (all-day windows overlap anything).
        intervals.sort((a, b) => a[0] - b[0]);
        for (let index = 1; index < intervals.length; index += 1) {
            const previous = intervals[index - 1];
            const current = intervals[index];
            if (previous[1] > current[0]) {
                throw new Error(`deepseek-usage: schedule ${schedule.id} has overlapping windows`);
            }
        }
        for (const model of schedule.models) {
            if (model.model.trim() === '')
                throw new Error(`deepseek-usage: schedule ${schedule.id} has a model with an empty id`);
            for (const [bandId, rates] of Object.entries(model.ratesByBand)) {
                // A band is legal when it is the implicit off-peak or the band of at
                // least one window (window.bandId ?? window.id).
                if (bandId !== OFF_PEAK_BAND_ID && !bandIds.has(bandId)) {
                    throw new Error(`deepseek-usage: schedule ${schedule.id} model ${model.model} references unknown band "${bandId}"`);
                }
                assertValidRates(rates, `schedule ${schedule.id} model ${model.model} band ${bandId}`);
            }
        }
        if (schedule.models.filter(item => item.model === '*').length > 1) {
            throw new Error(`deepseek-usage: schedule ${schedule.id} has more than one "*" wildcard entry`);
        }
    }
}
/**
 * Build one all-day schedule per `effectiveFrom` group from a legacy
 * `PriceEntry[]` config (backward compatibility: existing `prices` keep
 * working, including user-configured `*` fallback rows).
 */
export function buildSchedulesFromPriceEntries(entries) {
    if (entries.length === 0)
        throw new Error('deepseek-usage: prices must contain at least one entry');
    const currency = entries[0].currency;
    const byDate = new Map();
    for (const entry of entries) {
        if (entry.currency !== currency) {
            throw new Error(`deepseek-usage: price entry ${entry.model} uses ${entry.currency} but the table is priced in ${currency}; mixed currencies are not supported`);
        }
        const models = byDate.get(entry.effectiveFrom) ?? [];
        models.push({
            model: entry.model,
            ratesByBand: {
                [ALL_DAY_WINDOW_ID]: {
                    cacheHitInputPricePerMillion: entry.cacheHitInputPricePerMillion,
                    cacheMissInputPricePerMillion: entry.cacheMissInputPricePerMillion,
                    outputPricePerMillion: entry.outputPricePerMillion,
                },
            },
        });
        byDate.set(entry.effectiveFrom, models);
    }
    return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, models]) => ({
        id: `user-legacy-${date}`,
        effectiveFrom: normalizeEffectiveFrom(date, DEFAULT_SCHEDULE_TIMEZONE),
        timezone: DEFAULT_SCHEDULE_TIMEZONE,
        currency,
        windows: [{ id: ALL_DAY_WINDOW_ID, start: '00:00', end: '00:00' }],
        models,
    }));
}
/**
 * The built-in legacy schedule: the repository's current 2026-04-24 DeepSeek
 * table, migrated VERBATIM (only the numbers already present in this repo —
 * no new price is invented here). It deliberately has NO `*` fallback: a
 * built-in default must never silently price an unknown model.
 */
export const LEGACY_SCHEDULE = {
    id: 'legacy-2026-04-24',
    effectiveFrom: '2026-04-24T00:00:00+08:00',
    timezone: DEFAULT_SCHEDULE_TIMEZONE,
    currency: 'CNY',
    windows: [{ id: ALL_DAY_WINDOW_ID, start: '00:00', end: '00:00' }],
    models: [
        {
            model: 'deepseek-v4-flash',
            ratesByBand: { [ALL_DAY_WINDOW_ID]: { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } },
        },
        {
            model: 'deepseek-v4-pro',
            ratesByBand: { [ALL_DAY_WINDOW_ID]: { cacheHitInputPricePerMillion: 0.025, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 6 } },
        },
        {
            model: 'deepseek-chat',
            ratesByBand: { [ALL_DAY_WINDOW_ID]: { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } },
        },
        {
            model: 'deepseek-reasoner',
            ratesByBand: { [ALL_DAY_WINDOW_ID]: { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } },
        },
    ],
};
/**
 * The built-in official schedule for the DeepSeek 2026-08-17 price change.
 *
 * Source: DeepSeek official API pricing notice — effective 2026-08-17
 * 00:00 Beijing Time (Asia/Shanghai), quoted in CNY per 1,000,000 tokens.
 * Peak windows (local wall clock, start inclusive / end exclusive):
 *   09:00–12:00 and 14:00–18:00; ALL other minutes are off-peak
 *   (off-peak = exactly half of the peak price per token category).
 *
 * Only the two officially announced models are priced here; any other model
 * (including deepseek-chat / deepseek-reasoner / unknown future models)
 * resolves to UNPRICED under this schedule — an exact official price beats
 * a guessed fallback, and the built-in default never ships a `*` wildcard.
 *
 * `peak-morning` and `peak-afternoon` share one `peak` band so the peak
 * rates are written exactly once (the engine's shared-band feature).
 */
export const DEEPSEEK_2026_08_17_SCHEDULE = {
    id: 'deepseek-2026-08-17',
    effectiveFrom: '2026-08-17T00:00:00+08:00',
    timezone: DEFAULT_SCHEDULE_TIMEZONE,
    currency: 'CNY',
    windows: [
        { id: 'peak-morning', bandId: 'peak', start: '09:00', end: '12:00' },
        { id: 'peak-afternoon', bandId: 'peak', start: '14:00', end: '18:00' },
    ],
    models: [
        {
            model: 'deepseek-v4-flash',
            ratesByBand: {
                peak: { cacheHitInputPricePerMillion: 0.1, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 9 },
                'off-peak': { cacheHitInputPricePerMillion: 0.05, cacheMissInputPricePerMillion: 1.5, outputPricePerMillion: 4.5 },
            },
        },
        {
            model: 'deepseek-v4-pro',
            ratesByBand: {
                peak: { cacheHitInputPricePerMillion: 0.3, cacheMissInputPricePerMillion: 9, outputPricePerMillion: 27 },
                'off-peak': { cacheHitInputPricePerMillion: 0.15, cacheMissInputPricePerMillion: 4.5, outputPricePerMillion: 13.5 },
            },
        },
    ],
};
/**
 * The built-in default schedule set: the legacy 2026-04-24 table (prices
 * everything up to the 2026-08-17 boundary, so history never changes) plus
 * the official 2026-08-17 table. Requests at or after
 * `2026-08-17T00:00:00+08:00` are priced under the new time-aware schedule.
 */
export const DEFAULT_SCHEDULES = [LEGACY_SCHEDULE, DEEPSEEK_2026_08_17_SCHEDULE];
/** Structural equality of two schedule sets (pricing-config change detection). */
export function pricingSetsEqual(a, b) {
    if (a.schedules.length !== b.schedules.length)
        return false;
    return a.schedules.every((schedule, index) => {
        const other = b.schedules[index];
        if (schedule.id !== other.id
            || schedule.effectiveFrom !== other.effectiveFrom
            || schedule.timezone !== other.timezone
            || schedule.currency !== other.currency
            || schedule.windows.length !== other.windows.length
            || schedule.models.length !== other.models.length) {
            return false;
        }
        if (!schedule.windows.every((window, windowIndex) => {
            const sibling = other.windows[windowIndex];
            return window.id === sibling.id && window.start === sibling.start && window.end === sibling.end && (window.bandId ?? '') === (sibling.bandId ?? '');
        })) {
            return false;
        }
        return schedule.models.every((model, modelIndex) => {
            const sibling = other.models[modelIndex];
            if (model.model !== sibling.model)
                return false;
            const bands = Object.keys(model.ratesByBand);
            const siblingBands = Object.keys(sibling.ratesByBand);
            if (bands.length !== siblingBands.length)
                return false;
            return bands.every(band => {
                const rates = model.ratesByBand[band];
                const siblingRates = sibling.ratesByBand[band];
                return siblingRates !== undefined
                    && rates.cacheHitInputPricePerMillion === siblingRates.cacheHitInputPricePerMillion
                    && rates.cacheMissInputPricePerMillion === siblingRates.cacheMissInputPricePerMillion
                    && rates.outputPricePerMillion === siblingRates.outputPricePerMillion;
            });
        });
    });
}
/** The zero estimate (no store / no rows yet). */
export function emptyDayCostEstimate(currency = 'CNY') {
    return {
        total: '0',
        totalMicro: '0',
        currency,
        pricedRequestCount: 0,
        unpricedRequestCount: 0,
        unpriced: { cacheHitInputTokens: 0, cacheMissInputTokens: 0, outputTokens: 0 },
        scheduleIdsUsed: [],
        bandCosts: [],
    };
}
/** Turn a row's stored buckets into the mapping shape the cost math needs. */
function bucketsOf(row) {
    return {
        cacheHitInputTokens: row.cacheHit,
        cacheMissInputTokens: row.cacheMiss,
        outputTokens: row.output,
        reasoningTokens: 0,
        totalInputTokens: row.cacheHit + row.cacheMiss,
        totalTokens: row.cacheHit + row.cacheMiss + row.output,
    };
}
/**
 * Aggregate one day's rows into a cost estimate. Every row is priced at its
 * OWN request time against the schedule set — never "today's tokens × the
 * current price". Failed rows carry no usage and are ignored entirely.
 */
export function aggregateDayCost(schedules, rows) {
    const prepared = prepareScheduleSet(schedules);
    const currency = schedules[0]?.currency ?? 'CNY';
    let total = 0n;
    let priced = 0;
    let unpricedCount = 0;
    const unpricedTokens = { cacheHitInputTokens: 0, cacheMissInputTokens: 0, outputTokens: 0 };
    const scheduleIds = new Set();
    // Band split: keyed by the band the row's OWN request time resolved to.
    const bandShares = new Map();
    for (const row of rows) {
        if (row.failed)
            continue; // failed requests have no known usage — never priced
        const resolved = resolvePricing(prepared, row.model, row.requestTime);
        if (resolved.status === 'unpriced') {
            unpricedCount += 1;
            unpricedTokens.cacheHitInputTokens += row.cacheHit;
            unpricedTokens.cacheMissInputTokens += row.cacheMiss;
            unpricedTokens.outputTokens += row.output;
            continue;
        }
        priced += 1;
        scheduleIds.add(resolved.scheduleId);
        const cost = costOfBuckets(resolved.rates, bucketsOf(row)).total;
        total += cost;
        const share = bandShares.get(resolved.bandId) ?? { total: 0n, count: 0, cacheHit: 0, cacheMiss: 0, output: 0 };
        share.total += cost;
        share.count += 1;
        share.cacheHit += row.cacheHit;
        share.cacheMiss += row.cacheMiss;
        share.output += row.output;
        bandShares.set(resolved.bandId, share);
    }
    return {
        total: formatMicro(total, 6),
        totalMicro: total.toString(),
        currency,
        pricedRequestCount: priced,
        unpricedRequestCount: unpricedCount,
        unpriced: unpricedTokens,
        scheduleIdsUsed: [...scheduleIds],
        bandCosts: [...bandShares.entries()].map(([bandId, share]) => ({
            bandId,
            totalMicro: share.total.toString(),
            requestCount: share.count,
            cacheHitInputTokens: share.cacheHit,
            cacheMissInputTokens: share.cacheMiss,
            outputTokens: share.output,
        })),
    };
}
