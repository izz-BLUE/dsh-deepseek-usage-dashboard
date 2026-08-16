import z from "schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { z as z$1 } from "zod";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
//#region src/core/money.ts
/** Scale factor: micro-units per currency unit. */
const MICRO_SCALE = 1000000n;
/**
* Convert a configured per-million price into micro-units per million tokens.
* The price must be finite and non-negative; values beyond 6 decimals round.
*/
function priceToMicroPerMillion(pricePerMillion) {
	if (!Number.isFinite(pricePerMillion) || pricePerMillion < 0) throw new Error(`deepseek-usage: invalid price ${pricePerMillion}`);
	return BigInt(Math.round(pricePerMillion * 1e6));
}
/**
* The micro-unit cost of `tokens` at a per-million price:
* `tokens * price / 1e6` in micro-units, rounded half-up on the final
* sub-micro fraction.
*/
function tokensCostMicro(tokens, pricePerMillion) {
	if (!Number.isSafeInteger(tokens) || tokens < 0) throw new Error(`deepseek-usage: invalid token count ${tokens}`);
	return (BigInt(tokens) * priceToMicroPerMillion(pricePerMillion) + MICRO_SCALE / 2n) / MICRO_SCALE;
}
/** Sum micro amounts (the only accumulation path — integer BigInt addition). */
function sumMicro(values) {
	let total = 0n;
	for (const value of values) total += value;
	return total;
}
/** Render micro-units as a decimal string with `decimals` fraction digits. */
function formatMicro(value, decimals = 4) {
	if (decimals < 0 || decimals > 9) throw new Error(`deepseek-usage: bad decimals ${decimals}`);
	const negative = value < 0n;
	const absolute = negative ? -value : value;
	const scale = 10n ** BigInt(decimals);
	const whole = absolute / scale;
	const fraction = (absolute % scale).toString().padStart(decimals, "0");
	const rendered = decimals === 0 ? whole.toString() : `${whole.toString()}.${fraction}`;
	return negative ? `-${rendered}` : rendered;
}
//#endregion
//#region src/core/pricing.ts
/**
* Default price table. Source: DeepSeek's public pricing page as of the
* `effectiveFrom` dates. These are ESTIMATES — the dashboard labels every
* amount as an estimate and never as an official bill, and the user can edit
* the table in the settings page.
*
* No `*` fallback is shipped: the engine treats unknown models as UNPRICED
* unless the user explicitly configures a wildcard row.
*/
const DEFAULT_PRICE_ENTRIES = [
	{
		model: "deepseek-v4-flash",
		cacheHitInputPricePerMillion: .02,
		cacheMissInputPricePerMillion: 1,
		outputPricePerMillion: 2,
		currency: "CNY",
		effectiveFrom: "2026-04-24"
	},
	{
		model: "deepseek-v4-pro",
		cacheHitInputPricePerMillion: .025,
		cacheMissInputPricePerMillion: 3,
		outputPricePerMillion: 6,
		currency: "CNY",
		effectiveFrom: "2026-04-24"
	},
	{
		model: "deepseek-chat",
		cacheHitInputPricePerMillion: .02,
		cacheMissInputPricePerMillion: 1,
		outputPricePerMillion: 2,
		currency: "CNY",
		effectiveFrom: "2026-04-24"
	},
	{
		model: "deepseek-reasoner",
		cacheHitInputPricePerMillion: .02,
		cacheMissInputPricePerMillion: 1,
		outputPricePerMillion: 2,
		currency: "CNY",
		effectiveFrom: "2026-04-24"
	}
];
/** Estimate one usage row's cost in micro-units (integer arithmetic only). */
function costOfBuckets(rates, buckets) {
	const cacheHit = tokensCostMicro(buckets.cacheHitInputTokens, rates.cacheHitInputPricePerMillion);
	const cacheMiss = tokensCostMicro(buckets.cacheMissInputTokens, rates.cacheMissInputPricePerMillion);
	const output = tokensCostMicro(buckets.outputTokens, rates.outputPricePerMillion);
	return {
		cacheHit,
		cacheMiss,
		output,
		total: sumMicro([
			cacheHit,
			cacheMiss,
			output
		])
	};
}
/** Validate one configured price entry; throws with a specific message. */
function assertValidPriceEntry(entry, index) {
	const where = `price entry ${index} (${entry.model})`;
	if (entry.model.trim() === "") throw new Error(`deepseek-usage: ${where} has an empty model`);
	for (const [name, value] of [
		["cacheHitInputPricePerMillion", entry.cacheHitInputPricePerMillion],
		["cacheMissInputPricePerMillion", entry.cacheMissInputPricePerMillion],
		["outputPricePerMillion", entry.outputPricePerMillion]
	]) if (!Number.isFinite(value) || value < 0) throw new Error(`deepseek-usage: ${where} ${name} must be a non-negative number`);
	if (entry.currency.trim() === "") throw new Error(`deepseek-usage: ${where} has an empty currency`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.effectiveFrom)) throw new Error(`deepseek-usage: ${where} effectiveFrom must be YYYY-MM-DD`);
}
//#endregion
//#region src/core/day.ts
/**
* Asia/Shanghai natural-day keying.
*
* Day keys are `YYYY-MM-DD` strings computed in the Asia/Shanghai time zone
* (UTC+8, no DST since 1991). `Intl.DateTimeFormat` with an explicit
* `timeZone` is the only timezone database available in every Node runtime
* without shipping tz data, and it is exact for fixed-offset zones.
*/
/** The timezone every daily bucket is computed in. */
const DAY_TIMEZONE = "Asia/Shanghai";
/**
* Date-parts formatter for one timezone. `Intl.DateTimeFormat` with an
* explicit `timeZone` is the only timezone database available in every Node
* runtime without shipping tz data, and it is exact for fixed-offset zones.
* Formatters are cached per timezone (the number of distinct zones in a
* pricing config is tiny).
*/
const FORMATTER_CACHE = /* @__PURE__ */ new Map();
function partsFormatter(timezone) {
	let formatter = FORMATTER_CACHE.get(timezone);
	if (formatter === void 0) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false
		});
		FORMATTER_CACHE.set(timezone, formatter);
	}
	return formatter;
}
/** Parse one instant's wall clock in `timezone` (formatter-based). */
function wallClockAt(epochMs, timezone) {
	const parts = partsFormatter(timezone).formatToParts(epochMs);
	const read = (type) => {
		const part = parts.find((item) => item.type === type);
		return part === void 0 ? 0 : Number.parseInt(part.value, 10);
	};
	return {
		year: read("year"),
		month: read("month"),
		day: read("day"),
		hour: read("hour"),
		minute: read("minute"),
		second: read("second")
	};
}
/** The UTC offset (milliseconds east of UTC) of `timezone` at one instant. */
function timezoneOffsetMs(epochMs, timezone) {
	const clock = wallClockAt(epochMs, timezone);
	return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) - epochMs;
}
/** Compute `YYYY-MM-DD` (Asia/Shanghai) for one epoch-millisecond instant. */
function dayKeyOf(epochMs) {
	const clock = wallClockAt(epochMs, DAY_TIMEZONE);
	return `${String(clock.year).padStart(4, "0")}-${String(clock.month).padStart(2, "0")}-${String(clock.day).padStart(2, "0")}`;
}
/** The inclusive [start, end) epoch-millisecond range of one Shanghai day. */
function dayRangeMs(dayKey) {
	return dayRangeMsInTimezone(dayKey, DAY_TIMEZONE);
}
/** The inclusive [start, end) epoch-millisecond range of one `timezone` day. */
function dayRangeMsInTimezone(dayKey, timezone) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
	if (match === null) throw new Error(`deepseek-usage: invalid day key ${dayKey}`);
	const year = Number.parseInt(match[1], 10);
	const month = Number.parseInt(match[2], 10);
	const day = Number.parseInt(match[3], 10);
	const utcMidnight = Date.UTC(year, month - 1, day);
	const startMs = utcMidnight - timezoneOffsetMs(utcMidnight, timezone);
	return {
		startMs,
		endMs: startMs + 864e5
	};
}
/** The minute-of-day (0..1439) of one instant in `timezone`. */
function minuteOfDayInTimezone(epochMs, timezone) {
	const clock = wallClockAt(epochMs, timezone);
	return clock.hour * 60 + clock.minute;
}
/** The previous calendar day's key in Asia/Shanghai. */
function previousDayKey(dayKey) {
	const { startMs } = dayRangeMs(dayKey);
	return dayKeyOf(startMs - 1);
}
/** The last `count` day keys ending at (and including) `todayKey`. */
function recentDayKeys(todayKey, count) {
	const keys = [];
	let cursor = todayKey;
	for (let i = 0; i < count; i += 1) {
		keys.unshift(cursor);
		cursor = previousDayKey(cursor);
	}
	return keys;
}
//#endregion
//#region src/core/schedule.ts
/** The implicit band for minutes not covered by any declared window. */
const OFF_PEAK_BAND_ID = "off-peak";
/** A window whose `start === end` covers the full day (all-day schedule). */
const ALL_DAY_WINDOW_ID = "all-day";
/** The default timezone for schedules and legacy normalization. */
const DEFAULT_SCHEDULE_TIMEZONE = "Asia/Shanghai";
/** Parse "HH:MM" into minutes of day; "24:00" (end only) becomes 1440. */
function parseMinuteOfDay(text, what) {
	const match = /^(\d{1,2}):(\d{2})$/.exec(text);
	if (match === null) throw new Error(`deepseek-usage: ${what} must be "HH:MM", got "${text}"`);
	const hours = Number.parseInt(match[1], 10);
	const minutes = Number.parseInt(match[2], 10);
	if (minutes > 59) throw new Error(`deepseek-usage: ${what} minutes out of range in "${text}"`);
	const value = hours * 60 + minutes;
	if (value < 0 || value > 1440) throw new Error(`deepseek-usage: ${what} out of range in "${text}"`);
	return value;
}
/** Whether one minute-of-day falls inside one window (start inclusive, end exclusive). */
function isInsideWindow(minuteOfDay, window) {
	const start = parseMinuteOfDay(window.start, `window ${window.id} start`);
	const end = parseMinuteOfDay(window.end, `window ${window.id} end`);
	if (start === end) return true;
	if (end > start) return minuteOfDay >= start && minuteOfDay < end;
	return minuteOfDay >= start || minuteOfDay < end;
}
/** The band id covering one minute of day (a window id, or implicit off-peak). */
function bandForMinute(schedule, minuteOfDay) {
	for (const window of schedule.windows) if (isInsideWindow(minuteOfDay, window)) return {
		bandId: window.id,
		window
	};
	return {
		bandId: OFF_PEAK_BAND_ID,
		window: null
	};
}
/** Whether a value is an ISO 8601 instant with an explicit offset/Z designator. */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** A legacy `YYYY-MM-DD` date (interpreted as midnight in the timezone). */
const LEGACY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Render an offset as `±HH:MM` (milliseconds east of UTC). */
function formatOffset(offsetMs) {
	const sign = offsetMs < 0 ? "-" : "+";
	const absolute = Math.abs(offsetMs);
	const hours = Math.floor(absolute / 36e5);
	const minutes = Math.floor(absolute % 36e5 / 6e4);
	return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
/**
* Normalize an `effectiveFrom` value into an ISO 8601 instant with offset.
* A legacy `YYYY-MM-DD` becomes midnight in `timezone` (e.g.
* `2026-04-24T00:00:00+08:00`), so existing configs keep working unchanged.
*/
function normalizeEffectiveFrom(value, timezone) {
	const trimmed = value.trim();
	if (LEGACY_DATE_RE.test(trimmed)) {
		const startMs = dayRangeMsInTimezone(trimmed, timezone).startMs;
		return `${trimmed}T00:00:00${formatOffset(timezoneOffsetMs(startMs, timezone))}`;
	}
	if (!ISO_INSTANT_RE.test(trimmed) || Number.isNaN(Date.parse(trimmed))) throw new Error(`deepseek-usage: effectiveFrom "${value}" must be YYYY-MM-DD or an ISO 8601 instant with offset`);
	return trimmed;
}
/** The epoch-millisecond instant a schedule becomes effective (inclusive). */
function effectiveFromEpochMs(schedule) {
	const parsed = Date.parse(normalizeEffectiveFrom(schedule.effectiveFrom, schedule.timezone));
	if (Number.isNaN(parsed)) throw new Error(`deepseek-usage: schedule ${schedule.id} has an invalid effectiveFrom "${schedule.effectiveFrom}"`);
	return parsed;
}
/**
* Sort and precompute the effective instants of a schedule list. The
* resolved schedule for a request is the one with the largest
* `effectiveFrom <= requestTime` — later schedules never reprice earlier
* requests, because the list is only ever scanned up to the request time.
*/
function prepareScheduleSet(schedules) {
	return schedules.map((schedule) => ({
		schedule,
		effectiveMs: effectiveFromEpochMs(schedule)
	})).sort((a, b) => a.effectiveMs - b.effectiveMs);
}
/**
* Resolve the pricing of one model at one request instant.
*
* Selection: schedules with `effectiveFrom <= requestTime`, taking the
* LATEST one; the request's wall clock in the schedule's timezone picks the
* band; then an exact model match, then an EXPLICIT user `*` wildcard. Any
* other outcome is `unpriced` — never thrown, never a silent fake number.
*/
function resolvePricing(prepared, model, requestTimeMs) {
	let schedule;
	for (const candidate of prepared) if (candidate.effectiveMs <= requestTimeMs) schedule = candidate;
	else break;
	if (schedule === void 0) return {
		status: "unpriced",
		model,
		reason: "no-schedule"
	};
	const { bandId } = bandForMinute(schedule.schedule, minuteOfDayInTimezone(requestTimeMs, schedule.schedule.timezone));
	const entry = schedule.schedule.models.find((item) => item.model === model) ?? schedule.schedule.models.find((item) => item.model === "*");
	if (entry === void 0) return {
		status: "unpriced",
		model,
		reason: "unknown-model"
	};
	const rates = entry.ratesByBand[bandId];
	if (rates === void 0) return {
		status: "unpriced",
		model,
		reason: "no-rates-for-band"
	};
	return {
		status: "priced",
		scheduleId: schedule.schedule.id,
		effectiveFrom: schedule.schedule.effectiveFrom,
		timezone: schedule.schedule.timezone,
		bandId,
		model,
		currency: schedule.schedule.currency,
		rates
	};
}
/** Validate one rates object (non-negative finite numbers). */
function assertValidRates(rates, where) {
	for (const [name, value] of [
		["cacheHitInputPricePerMillion", rates.cacheHitInputPricePerMillion],
		["cacheMissInputPricePerMillion", rates.cacheMissInputPricePerMillion],
		["outputPricePerMillion", rates.outputPricePerMillion]
	]) if (!Number.isFinite(value) || value < 0) throw new Error(`deepseek-usage: ${where} ${name} must be a non-negative number`);
}
/** The minute-of-day intervals one window covers (cross-midnight splits). */
function windowIntervals(window) {
	const start = parseMinuteOfDay(window.start, `window ${window.id} start`);
	const end = parseMinuteOfDay(window.end, `window ${window.id} end`);
	if (start === end) return [[0, 1440]];
	if (end > start) return [[start, end]];
	return [[start, 1440], [0, end]];
}
/** Validate the whole schedule set; throws with a specific message. */
function validatePricingScheduleSet(set) {
	if (set.schedules.length === 0) throw new Error("deepseek-usage: pricingSchedules must contain at least one schedule");
	const seenIds = /* @__PURE__ */ new Set();
	const seenEffective = /* @__PURE__ */ new Set();
	let currency;
	for (const schedule of set.schedules) {
		if (schedule.id.trim() === "") throw new Error("deepseek-usage: every pricing schedule needs a non-empty id");
		if (seenIds.has(schedule.id)) throw new Error(`deepseek-usage: duplicate pricing schedule id "${schedule.id}"`);
		seenIds.add(schedule.id);
		if (schedule.currency.trim() === "") throw new Error(`deepseek-usage: schedule ${schedule.id} has an empty currency`);
		if (currency === void 0) currency = schedule.currency;
		else if (currency !== schedule.currency) throw new Error(`deepseek-usage: schedule ${schedule.id} uses ${schedule.currency} but the set is priced in ${currency}; mixed currencies are not supported`);
		const effectiveMs = effectiveFromEpochMs(schedule);
		if (seenEffective.has(effectiveMs)) throw new Error(`deepseek-usage: schedules ${schedule.id} and a sibling share the same effectiveFrom instant`);
		seenEffective.add(effectiveMs);
		if (schedule.windows.length === 0) throw new Error(`deepseek-usage: schedule ${schedule.id} needs at least one window (use start "00:00" end "00:00" for all-day)`);
		const windowIds = /* @__PURE__ */ new Set();
		const intervals = [];
		for (const window of schedule.windows) {
			if (window.id.trim() === "") throw new Error(`deepseek-usage: schedule ${schedule.id} has a window with an empty id`);
			if (windowIds.has(window.id)) throw new Error(`deepseek-usage: schedule ${schedule.id} has duplicate window id "${window.id}"`);
			windowIds.add(window.id);
			const parts = windowIntervals(window);
			for (const interval of parts) intervals.push(interval);
		}
		intervals.sort((a, b) => a[0] - b[0]);
		for (let index = 1; index < intervals.length; index += 1) {
			const previous = intervals[index - 1];
			const current = intervals[index];
			if (previous[1] > current[0]) throw new Error(`deepseek-usage: schedule ${schedule.id} has overlapping windows`);
		}
		for (const model of schedule.models) {
			if (model.model.trim() === "") throw new Error(`deepseek-usage: schedule ${schedule.id} has a model with an empty id`);
			for (const [bandId, rates] of Object.entries(model.ratesByBand)) {
				if (bandId !== "off-peak" && !windowIds.has(bandId)) throw new Error(`deepseek-usage: schedule ${schedule.id} model ${model.model} references unknown band "${bandId}"`);
				assertValidRates(rates, `schedule ${schedule.id} model ${model.model} band ${bandId}`);
			}
		}
		if (schedule.models.filter((item) => item.model === "*").length > 1) throw new Error(`deepseek-usage: schedule ${schedule.id} has more than one "*" wildcard entry`);
	}
}
/**
* Build one all-day schedule per `effectiveFrom` group from a legacy
* `PriceEntry[]` config (backward compatibility: existing `prices` keep
* working, including user-configured `*` fallback rows).
*/
function buildSchedulesFromPriceEntries(entries) {
	if (entries.length === 0) throw new Error("deepseek-usage: prices must contain at least one entry");
	const currency = entries[0].currency;
	const byDate = /* @__PURE__ */ new Map();
	for (const entry of entries) {
		if (entry.currency !== currency) throw new Error(`deepseek-usage: price entry ${entry.model} uses ${entry.currency} but the table is priced in ${currency}; mixed currencies are not supported`);
		const models = byDate.get(entry.effectiveFrom) ?? [];
		models.push({
			model: entry.model,
			ratesByBand: { [ALL_DAY_WINDOW_ID]: {
				cacheHitInputPricePerMillion: entry.cacheHitInputPricePerMillion,
				cacheMissInputPricePerMillion: entry.cacheMissInputPricePerMillion,
				outputPricePerMillion: entry.outputPricePerMillion
			} }
		});
		byDate.set(entry.effectiveFrom, models);
	}
	return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, models]) => ({
		id: `user-legacy-${date}`,
		effectiveFrom: normalizeEffectiveFrom(date, DEFAULT_SCHEDULE_TIMEZONE),
		timezone: DEFAULT_SCHEDULE_TIMEZONE,
		currency,
		windows: [{
			id: ALL_DAY_WINDOW_ID,
			start: "00:00",
			end: "00:00"
		}],
		models
	}));
}
/**
* The built-in legacy schedule: the repository's current 2026-04-24 DeepSeek
* table, migrated VERBATIM (only the numbers already present in this repo —
* no new price is invented here). It deliberately has NO `*` fallback: a
* built-in default must never silently price an unknown model.
*/
const LEGACY_SCHEDULE = {
	id: "legacy-2026-04-24",
	effectiveFrom: "2026-04-24T00:00:00+08:00",
	timezone: DEFAULT_SCHEDULE_TIMEZONE,
	currency: "CNY",
	windows: [{
		id: ALL_DAY_WINDOW_ID,
		start: "00:00",
		end: "00:00"
	}],
	models: [
		{
			model: "deepseek-v4-flash",
			ratesByBand: { [ALL_DAY_WINDOW_ID]: {
				cacheHitInputPricePerMillion: .02,
				cacheMissInputPricePerMillion: 1,
				outputPricePerMillion: 2
			} }
		},
		{
			model: "deepseek-v4-pro",
			ratesByBand: { [ALL_DAY_WINDOW_ID]: {
				cacheHitInputPricePerMillion: .025,
				cacheMissInputPricePerMillion: 3,
				outputPricePerMillion: 6
			} }
		},
		{
			model: "deepseek-chat",
			ratesByBand: { [ALL_DAY_WINDOW_ID]: {
				cacheHitInputPricePerMillion: .02,
				cacheMissInputPricePerMillion: 1,
				outputPricePerMillion: 2
			} }
		},
		{
			model: "deepseek-reasoner",
			ratesByBand: { [ALL_DAY_WINDOW_ID]: {
				cacheHitInputPricePerMillion: .02,
				cacheMissInputPricePerMillion: 1,
				outputPricePerMillion: 2
			} }
		}
	]
};
/** Structural equality of two schedule sets (pricing-config change detection). */
function pricingSetsEqual(a, b) {
	if (a.schedules.length !== b.schedules.length) return false;
	return a.schedules.every((schedule, index) => {
		const other = b.schedules[index];
		if (schedule.id !== other.id || schedule.effectiveFrom !== other.effectiveFrom || schedule.timezone !== other.timezone || schedule.currency !== other.currency || schedule.windows.length !== other.windows.length || schedule.models.length !== other.models.length) return false;
		if (!schedule.windows.every((window, windowIndex) => {
			const sibling = other.windows[windowIndex];
			return window.id === sibling.id && window.start === sibling.start && window.end === sibling.end;
		})) return false;
		return schedule.models.every((model, modelIndex) => {
			const sibling = other.models[modelIndex];
			if (model.model !== sibling.model) return false;
			const bands = Object.keys(model.ratesByBand);
			const siblingBands = Object.keys(sibling.ratesByBand);
			if (bands.length !== siblingBands.length) return false;
			return bands.every((band) => {
				const rates = model.ratesByBand[band];
				const siblingRates = sibling.ratesByBand[band];
				return siblingRates !== void 0 && rates.cacheHitInputPricePerMillion === siblingRates.cacheHitInputPricePerMillion && rates.cacheMissInputPricePerMillion === siblingRates.cacheMissInputPricePerMillion && rates.outputPricePerMillion === siblingRates.outputPricePerMillion;
			});
		});
	});
}
/** Turn a row's stored buckets into the mapping shape the cost math needs. */
function bucketsOf(row) {
	return {
		cacheHitInputTokens: row.cacheHit,
		cacheMissInputTokens: row.cacheMiss,
		outputTokens: row.output,
		reasoningTokens: 0,
		totalInputTokens: row.cacheHit + row.cacheMiss,
		totalTokens: row.cacheHit + row.cacheMiss + row.output
	};
}
/**
* Aggregate one day's rows into a cost estimate. Every row is priced at its
* OWN request time against the schedule set — never "today's tokens × the
* current price". Failed rows carry no usage and are ignored entirely.
*/
function aggregateDayCost(schedules, rows) {
	const prepared = prepareScheduleSet(schedules);
	const currency = schedules[0]?.currency ?? "CNY";
	let total = 0n;
	let priced = 0;
	let unpricedCount = 0;
	const unpricedTokens = {
		cacheHitInputTokens: 0,
		cacheMissInputTokens: 0,
		outputTokens: 0
	};
	const scheduleIds = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (row.failed) continue;
		const resolved = resolvePricing(prepared, row.model, row.requestTime);
		if (resolved.status === "unpriced") {
			unpricedCount += 1;
			unpricedTokens.cacheHitInputTokens += row.cacheHit;
			unpricedTokens.cacheMissInputTokens += row.cacheMiss;
			unpricedTokens.outputTokens += row.output;
			continue;
		}
		priced += 1;
		scheduleIds.add(resolved.scheduleId);
		total += costOfBuckets(resolved.rates, bucketsOf(row)).total;
	}
	return {
		total: formatMicro(total, 6),
		totalMicro: total.toString(),
		currency,
		pricedRequestCount: priced,
		unpricedRequestCount: unpricedCount,
		unpriced: unpricedTokens,
		scheduleIdsUsed: [...scheduleIds]
	};
}
//#endregion
//#region src/core/stats.ts
/** Aggregate one day's rows into {@link DailyStats}. */
function aggregateDaily(date, rows) {
	let cacheHit = 0;
	let cacheMiss = 0;
	let output = 0;
	let reasoning = 0;
	let failed = 0;
	for (const row of rows) {
		if (!row.failed) {
			cacheHit += row.cacheHit;
			cacheMiss += row.cacheMiss;
			output += row.output;
			reasoning += row.reasoning;
		}
		if (row.failed) failed += 1;
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
		cacheHitRate: denominator === 0 ? null : cacheHit / denominator
	};
}
//#endregion
//#region src/core/sqlite-store.ts
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
/** Durable store of usage rows, balance snapshots, and plugin meta. */
var UsageStore = class {
	db;
	/**
	* Open (and if necessary create/migrate) the store at `dbPath`.
	* @param dbPath - absolute SQLite file path.
	*/
	constructor(dbPath) {
		mkdirSync(dirname(dbPath), { recursive: true });
		this.db = openWithRecovery(dbPath);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA busy_timeout = 5000");
		this.db.exec("PRAGMA synchronous = NORMAL");
		this.migrate();
	}
	/** Create the schema (idempotent) and migrate older databases. */
	migrate() {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage_rows (
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        step INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        time_ms INTEGER NOT NULL,
        request_time_ms INTEGER,
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
    `);
		this.migrateRequestTime();
	}
	/**
	* Migration: databases created before `request_time_ms` existed gain the
	* column, and historical rows are backfilled with their settlement time —
	* a best-effort approximation (no real request-start timestamp survives),
	* while every NEW row always carries the real requestTime. The user's
	* database is never dropped or rebuilt.
	*/
	migrateRequestTime() {
		if (!this.db.prepare("PRAGMA table_info(usage_rows)").all().some((column) => column.name === "request_time_ms")) this.db.exec("ALTER TABLE usage_rows ADD COLUMN request_time_ms INTEGER");
		this.db.exec("UPDATE usage_rows SET request_time_ms = time_ms WHERE request_time_ms IS NULL");
	}
	/**
	* Insert step records idempotently (INSERT OR IGNORE on the
	* (session_id, turn, step) primary key). Synchronous by design: the single
	* host process serializes every write on one connection, so concurrent
	* projections cannot interleave partial rows.
	* @param rows - records to insert.
	* @returns how many rows landed and how many were ignored as duplicates.
	*/
	insertRows(rows) {
		if (rows.length === 0) return {
			inserted: 0,
			ignored: 0
		};
		const statement = this.db.prepare(`
      INSERT OR IGNORE INTO usage_rows
        (session_id, turn, step, seq, time_ms, request_time_ms, model, provider, cache_hit, cache_miss, output, reasoning, failed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
		let inserted = 0;
		for (const row of rows) {
			const result = statement.run(row.sessionId, row.turn, row.step, row.seq, row.time, row.requestTime, row.model, row.provider, row.cacheHit, row.cacheMiss, row.output, row.reasoning, row.failed ? 1 : 0);
			inserted += Number(result.changes);
		}
		return {
			inserted,
			ignored: rows.length - inserted
		};
	}
	/** Whether one exact step already has a row (idempotency probe). */
	hasRow(sessionId, turn, step) {
		return this.db.prepare("SELECT 1 FROM usage_rows WHERE session_id = ? AND turn = ? AND step = ?").get(sessionId, turn, step) !== void 0;
	}
	/** Read every row in one Asia/Shanghai day's [start, end) range. */
	rowsInRange(startMs, endMs) {
		return this.db.prepare("SELECT * FROM usage_rows WHERE time_ms >= ? AND time_ms < ? ORDER BY time_ms, session_id").all(startMs, endMs).map(rowFromSql);
	}
	/** Read every row ever stored (tests and trend scans). */
	allRows() {
		return this.db.prepare("SELECT * FROM usage_rows ORDER BY time_ms, session_id").all().map(rowFromSql);
	}
	/** Aggregate one day's rows into the daily statistics. */
	dailyStats(dayKey) {
		const { startMs, endMs } = dayRangeMs(dayKey);
		return aggregateDaily(dayKey, this.rowsInRange(startMs, endMs));
	}
	/** The total number of stored rows (sanity/telemetry). */
	rowCount() {
		return this.db.prepare("SELECT COUNT(*) AS count FROM usage_rows").get().count;
	}
	/** Read one meta string value. */
	metaGet(key) {
		return this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value;
	}
	/** Write one meta string value (upsert). */
	metaSet(key, value) {
		this.db.prepare(`
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `).run(key, value);
	}
	/** Load the last good balance snapshot, or undefined when never fetched. */
	loadBalance() {
		const row = this.db.prepare("SELECT payload, fetched_at_ms FROM balance_snapshots WHERE id = 1").get();
		if (row === void 0) return void 0;
		try {
			return {
				snapshot: JSON.parse(row.payload),
				fetchedAtMs: row.fetched_at_ms
			};
		} catch {
			return;
		}
	}
	/** Persist the last good balance snapshot (single-row upsert). */
	saveBalance(snapshot, fetchedAtMs, status) {
		this.db.prepare(`
      INSERT INTO balance_snapshots (id, payload, fetched_at_ms, status) VALUES (1, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, fetched_at_ms = excluded.fetched_at_ms, status = excluded.status
    `).run(JSON.stringify(snapshot), fetchedAtMs, status);
	}
	/** Close the database (plugin teardown). */
	close() {
		try {
			this.db.close();
		} catch {}
	}
};
/** Open the database, moving a corrupt file aside and starting fresh. */
function openWithRecovery(dbPath) {
	let opened;
	try {
		opened = new DatabaseSync(dbPath);
		const check = opened.prepare("PRAGMA integrity_check").get();
		if (check.integrity_check === "ok") return opened;
		opened.close();
		opened = void 0;
		throw new Error(`integrity_check: ${check.integrity_check}`);
	} catch {
		try {
			opened?.close();
		} catch {}
		const corruptPath = `${dbPath}.corrupt-${Date.now()}`;
		try {
			renameSync(dbPath, corruptPath);
		} catch {}
		return new DatabaseSync(dbPath);
	}
}
/** Map one SQL row back to a UsageRow. */
function rowFromSql(row) {
	return {
		sessionId: String(row.session_id),
		turn: Number(row.turn),
		step: Number(row.step),
		seq: Number(row.seq),
		time: Number(row.time_ms),
		requestTime: Number(row.request_time_ms ?? row.time_ms),
		model: String(row.model),
		provider: String(row.provider),
		cacheHit: Number(row.cache_hit),
		cacheMiss: Number(row.cache_miss),
		output: Number(row.output),
		reasoning: Number(row.reasoning),
		failed: Number(row.failed) === 1
	};
}
//#endregion
//#region src/host/endpoint.ts
/** The official DeepSeek provider route (per the adapter README). */
const DEFAULT_DEEPSEEK_PROVIDER = "deepseek-official";
/** The base-URL host that qualifies for counting. */
const DEEPSEEK_API_HOST = "api.deepseek.com";
/** Launch-environment key used by the official DeepSeek adapter. */
const DEEPSEEK_BASE_URL_ENV = "DEEPSEEK_BASE_URL";
/**
* Resolve the current DeepSeek endpoint facts using the official adapter's
* base-URL precedence without importing the adapter at runtime.
* Re-resolution is cheap (in-memory settings read) and is performed at every
* capture decision, so a settings edit reaches the next request without a
* restart.
* @param ctx - host context (settings + launch environment).
* @param providerId - the provider route id this plugin counts as DeepSeek.
*/
function resolveDeepseekEndpoint(ctx, providerId) {
	let section;
	const settings = ctx.get("settings");
	if (settings !== void 0) {
		const raw = settings.get(settingsNamespace("llm-deepseek"));
		if (typeof raw === "object" && raw !== null) section = raw;
	}
	const configuredBaseUrl = typeof section?.baseURL === "string" ? section.baseURL : void 0;
	const environmentBaseUrl = launchEnvironmentOf(ctx).get(DEEPSEEK_BASE_URL_ENV)?.value;
	const baseUrl = configuredBaseUrl ?? environmentBaseUrl ?? "https://api.deepseek.com";
	let host;
	try {
		host = new URL(baseUrl).hostname.toLowerCase();
	} catch {
		host = "";
	}
	return {
		providerId,
		baseUrl,
		matches: host === DEEPSEEK_API_HOST
	};
}
/** The credential reference name for the DeepSeek API key. */
function deepseekApiKeyRef(ctx) {
	const settings = ctx.get("settings");
	if (settings !== void 0) {
		const raw = settings.get(settingsNamespace("llm-deepseek"));
		if (typeof raw === "object" && raw !== null) {
			const apiKeyEnv = raw.apiKeyEnv;
			if (typeof apiKeyEnv === "string" && apiKeyEnv.trim() !== "") return apiKeyEnv.trim();
		}
	}
	return "DEEPSEEK_API_KEY";
}
//#endregion
//#region src/core/mapping.ts
/**
* Reproduce the official adapter's `mapUsage` exactly (equivalence pinned by
* tests): `cacheRead = prompt_tokens_details?.cached_tokens ??
* prompt_cache_hit_tokens`, `inputTokens = prompt_tokens - cacheRead`.
*/
function mapWireUsage(usage) {
	const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens;
	const reasoning = usage.completion_tokens_details?.reasoning_tokens;
	return {
		inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
		outputTokens: usage.completion_tokens,
		...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
		...reasoning !== void 0 ? { reasoningTokens: reasoning } : {}
	};
}
/** True when a non-negative integer (guards garbage usage values). */
function isCount(value) {
	return Number.isSafeInteger(value) && value >= 0;
}
/**
* Convert a harness TokenUsage (as produced by {@link mapWireUsage}) into
* daily buckets. Returns `undefined` when the usage is missing or carries
* invalid counts (callers then record nothing for the step).
*/
function bucketsFromTokenUsage(usage) {
	if (usage === void 0) return void 0;
	const cacheHit = usage.cacheReadTokens ?? 0;
	const cacheMiss = usage.inputTokens;
	const output = usage.outputTokens;
	const reasoning = usage.reasoningTokens ?? 0;
	if (!isCount(cacheHit) || !isCount(cacheMiss) || !isCount(output) || !isCount(reasoning)) return void 0;
	const cacheWrite = usage.cacheWriteTokens ?? 0;
	const totalInputTokens = cacheHit + cacheMiss + (isCount(cacheWrite) ? cacheWrite : 0);
	return {
		cacheHitInputTokens: cacheHit,
		cacheMissInputTokens: cacheMiss,
		outputTokens: output,
		reasoningTokens: reasoning,
		totalInputTokens,
		totalTokens: totalInputTokens + output
	};
}
//#endregion
//#region src/core/projection.ts
/**
* Pure session-event fold for DeepSeek usage capture.
*
* Registered into `ctx.sessionProjections` (the replayable projection
* registry, mirroring how dsh-live-stats registers `liveTokenUsage`): the
* registry drives `apply` over every committed session event and the change
* feed hands the host collector the settled step records. The SAME pure
* function refolds persisted event logs during the startup catch-up scan, so
* one fold implementation serves both the live path and the restart path.
*
* Settlement rules (documented contract):
* - A step records its usage when the FINAL usage arrives — the
*   `assistant/chunk` `usage` chunk or the `assistant/message` `usage`
*   field. Streaming deltas never settle anything; estimates are never
*   written to the daily exact statistics.
* - A step whose turn ends `error`/`aborted` without any usage is recorded
*   as FAILED (a request that never returned final usage).
* - Only one record per (turn, step): the second usage-bearing event for the
*   same step is dropped by the fold itself (and the SQLite UNIQUE
*   constraint backstops it).
*/
/** Initial fold state for an empty log. */
function initDeepseekUsageState() {
	return {
		header: void 0,
		steps: [],
		last: null
	};
}
/** The failure reasons that mark a usage-less step as a failed request. */
const FAILURE_KINDS = /* @__PURE__ */ new Set(["error", "aborted"]);
/**
* Fold one session event into the usage state (pure — no I/O).
* @param state - previous state.
* @param event - the next committed session event.
* @returns the next state (same reference when the event is not this fold's).
*/
function applyDeepseekUsageEvent(state, event) {
	switch (event.type) {
		case "request/header": {
			const config = event.data.header.config;
			return {
				...state,
				header: {
					provider: config.provider,
					model: config.model
				}
			};
		}
		case "step/start": return {
			...state,
			last: {
				turn: event.data.turn,
				step: event.data.step,
				seq: event.seq,
				time: event.time,
				requestTime: event.time,
				settled: false
			}
		};
		case "assistant/chunk":
			if (event.data.chunk.type !== "usage") return state;
			return settleStep(state, event.data.turn, event.data.step, event.seq, event.time, event.data.chunk.usage);
		case "assistant/message":
			if (event.data.usage === void 0) return state;
			return settleStep(state, event.data.turn, event.data.step, event.seq, event.time, event.data.usage);
		case "turn/end": {
			const turn = event.data.turn;
			const failed = FAILURE_KINDS.has(event.data.reason.kind);
			let next = state;
			if (failed && next.last !== null && next.last.turn === turn && !next.last.settled) next = {
				...next,
				steps: [...next.steps, failedRecord(next, next.last, event.seq, event.time)]
			};
			return {
				...next,
				last: null
			};
		}
		default: return state;
	}
}
/** Build the failed record for a usage-less step whose turn errored/aborted. */
function failedRecord(state, last, seq, time) {
	return {
		turn: last.turn,
		step: last.step,
		seq,
		time,
		requestTime: last.requestTime,
		provider: state.header?.provider ?? "",
		model: state.header?.model ?? "",
		cacheHit: 0,
		cacheMiss: 0,
		output: 0,
		reasoning: 0,
		failed: true
	};
}
/** Settle the matching active step with final usage (idempotent per step). */
function settleStep(state, turn, step, seq, time, usage) {
	const buckets = bucketsFromTokenUsage(usage);
	if (buckets === void 0) return state;
	if (state.last === null || state.last.turn !== turn || state.last.step !== step || state.last.settled) return state;
	const record = {
		turn,
		step,
		seq,
		time,
		requestTime: state.last.requestTime,
		provider: state.header?.provider ?? "",
		model: state.header?.model ?? "",
		cacheHit: buckets.cacheHitInputTokens,
		cacheMiss: buckets.cacheMissInputTokens,
		output: buckets.outputTokens,
		reasoning: buckets.reasoningTokens,
		failed: false
	};
	return {
		...state,
		steps: [...state.steps, record],
		last: {
			...state.last,
			settled: true
		}
	};
}
/** Schema validating the wire projection value. */
const deepseekUsageProjectionSchema = z$1.object({ steps: z$1.array(z$1.object({
	turn: z$1.number().int().nonnegative(),
	step: z$1.number().int().nonnegative(),
	seq: z$1.number().int().nonnegative(),
	time: z$1.number().int().nonnegative(),
	requestTime: z$1.number().int().nonnegative(),
	provider: z$1.string(),
	model: z$1.string(),
	cacheHit: z$1.number().int().nonnegative(),
	cacheMiss: z$1.number().int().nonnegative(),
	output: z$1.number().int().nonnegative(),
	reasoning: z$1.number().int().nonnegative(),
	failed: z$1.boolean()
}).strict()) }).strict();
/**
* The replayable `deepseekUsage` projection definition. Registering it into
* `ctx.sessionProjections` drives the fold over every committed session event.
*/
function createDeepseekUsageProjectionDefinition() {
	return {
		key: "deepseekUsage",
		schema: deepseekUsageProjectionSchema,
		init: initDeepseekUsageState,
		apply: applyDeepseekUsageEvent,
		view: (state) => ({ steps: state.steps }),
		stateVersion: 2
	};
}
//#endregion
//#region src/host/collector.ts
/** Whether one settled step is a DeepSeek request this plugin counts. */
function isCountedStep(facts, record) {
	return facts.matches && record.provider === facts.providerId;
}
/**
* Register the live capture path (projection + change feed).
* @param ctx - host context with sessionProjections.
* @param store - the durable store.
* @param facts - endpoint facts resolver.
* @returns disposer unregistering both.
*/
function registerUsageCapture(ctx, store, facts) {
	const watermarks = /* @__PURE__ */ new Map();
	const disposeProjection = ctx.sessionProjections.register(createDeepseekUsageProjectionDefinition());
	const disposeListener = ctx.sessionProjections.onChanged((session, key, value) => {
		if (key !== "deepseekUsage") return;
		const projection = value;
		const sessionId = session.id;
		const watermark = watermarks.get(sessionId) ?? -1;
		const endpoint = facts();
		const fresh = [];
		let newest = watermark;
		for (const record of projection.steps) {
			if (record.seq <= watermark) continue;
			if (record.seq > newest) newest = record.seq;
			if (!isCountedStep(endpoint, record)) continue;
			fresh.push({
				sessionId,
				...record
			});
		}
		if (fresh.length === 0) {
			if (newest > watermark) watermarks.set(sessionId, newest);
			return;
		}
		if (store.insertRows(fresh).ignored > 0) newest = Math.max(newest, ...fresh.map((row) => row.seq));
		watermarks.set(sessionId, newest);
	});
	return () => {
		disposeProjection();
		disposeListener();
	};
}
/**
* Catch-up scan: refold every session's persisted event log and insert rows
* missing from the store. Safe to run repeatedly (idempotent inserts).
* @param ctx - host context with sessionQuery.
* @param store - the durable store.
* @param facts - endpoint facts resolver.
* @returns the number of rows inserted by this scan.
*/
async function scanAllSessions(ctx, store, facts) {
	const sessionQuery = ctx.get("sessionQuery");
	if (sessionQuery === void 0) return 0;
	const records = await sessionQuery.listSessions();
	let inserted = 0;
	for (const record of records) {
		const sessionId = record.header.id;
		try {
			const snapshot = await sessionQuery.readSession(sessionId);
			inserted += foldAndInsert(snapshot.events, sessionId, store, facts());
		} catch (error) {
			ctx.logger.warn(`deepseek-usage: scan of session ${sessionId} failed`, error instanceof Error ? error.message : String(error));
		}
	}
	return inserted;
}
/** Fold one session's event log and insert the counted step records. */
function foldAndInsert(events, sessionId, store, endpoint) {
	let state = initDeepseekUsageState();
	for (const event of events) state = applyDeepseekUsageEvent(state, event);
	const rows = [];
	for (const record of state.steps) if (isCountedStep(endpoint, record)) rows.push({
		sessionId,
		...record
	});
	return store.insertRows(rows).inserted;
}
//#endregion
//#region src/core/balance.ts
/**
* DeepSeek balance client (Host-only).
*
* Calls GET https://api.deepseek.com/user/balance with the resolved
* DeepSeek credential. The base URL is FIXED to https://api.deepseek.com
* (requirement) — never configurable, never proxied through any other URL.
*
* Security contract:
* - The API key exists only on the Host; it is never logged, never sent to
*   the browser, and never accepted from request parameters.
* - Only the sanitized fields below leave this module; raw error bodies,
*   headers, and the credential never cross the boundary.
* - HTTP failures map to stable codes: 401 UNAUTHORIZED, 402
*   PAYMENT_REQUIRED, 429 RATE_LIMITED, 5xx SERVER_ERROR, timeout TIMEOUT,
*   malformed body BAD_RESPONSE, transport NETWORK, no key NO_KEY.
*/
/** The fixed balance endpoint (requirement: base URL fixed to api.deepseek.com). */
const BALANCE_URL = "https://api.deepseek.com/user/balance";
/** The per-request timeout (requirement: 10 seconds). */
const BALANCE_TIMEOUT_MS = 1e4;
/** Coerce one DeepSeek balance value to its decimal-string form. */
function balanceString(value) {
	if (typeof value === "string" && value.trim() !== "") return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
}
/**
* Validate and sanitize one raw balance response body. Returns `undefined`
* for a malformed body (BAD_RESPONSE) — nothing from the raw body survives
* except the five documented fields.
*/
function sanitizeBalanceBody(body) {
	if (typeof body !== "object" || body === null) return void 0;
	const record = body;
	if (typeof record.is_available !== "boolean") return void 0;
	if (!Array.isArray(record.balance_infos)) return void 0;
	const infos = [];
	for (const raw of record.balance_infos) {
		if (typeof raw !== "object" || raw === null) return void 0;
		const entry = raw;
		const currency = typeof entry.currency === "string" && entry.currency.trim() !== "" ? entry.currency.trim() : void 0;
		const totalBalance = balanceString(entry.total_balance);
		const grantedBalance = balanceString(entry.granted_balance);
		const toppedUpBalance = balanceString(entry.topped_up_balance);
		if (currency === void 0 || totalBalance === void 0 || grantedBalance === void 0 || toppedUpBalance === void 0) return;
		infos.push({
			currency,
			totalBalance,
			grantedBalance,
			toppedUpBalance
		});
	}
	return {
		isAvailable: record.is_available,
		infos
	};
}
/**
* Fetch the DeepSeek balance once. Direct Host fetch — this never touches
* any LLM interface.
* @param apiKey - the resolved DeepSeek credential (Host-side only).
* @param fetchImpl - fetch implementation (tests inject a fake).
* @returns the sanitized snapshot, or a stable failure code.
*/
async function fetchBalance(apiKey, fetchImpl = fetch) {
	let response;
	try {
		response = await fetchImpl(BALANCE_URL, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Accept: "application/json"
			},
			signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS)
		});
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") return {
			ok: false,
			code: "TIMEOUT"
		};
		if (error instanceof Error && error.name === "AbortError") return {
			ok: false,
			code: "TIMEOUT"
		};
		return {
			ok: false,
			code: "NETWORK"
		};
	}
	if (response.status === 401) return {
		ok: false,
		code: "UNAUTHORIZED"
	};
	if (response.status === 402) return {
		ok: false,
		code: "PAYMENT_REQUIRED"
	};
	if (response.status === 429) return {
		ok: false,
		code: "RATE_LIMITED"
	};
	if (response.status >= 500) return {
		ok: false,
		code: "SERVER_ERROR"
	};
	if (response.status !== 200) return {
		ok: false,
		code: "BAD_RESPONSE"
	};
	let text;
	try {
		text = await response.text();
	} catch {
		return {
			ok: false,
			code: "NETWORK"
		};
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return {
			ok: false,
			code: "BAD_RESPONSE"
		};
	}
	const snapshot = sanitizeBalanceBody(parsed);
	return snapshot === void 0 ? {
		ok: false,
		code: "BAD_RESPONSE"
	} : {
		ok: true,
		snapshot
	};
}
//#endregion
//#region src/host/balance-service.ts
/** Resolve the current DeepSeek credential (credentials seam first, env fallback). */
async function resolveDeepseekApiKey(ctx, refName) {
	const credentials = ctx.get("credentials");
	if (credentials !== void 0) try {
		const resolved = await credentials.resolve(credentialRef(refName));
		if (resolved !== void 0 && resolved.value.trim() !== "") return resolved.value.trim();
	} catch {}
	const fallback = process.env[refName];
	return fallback !== void 0 && fallback.trim() !== "" ? fallback.trim() : void 0;
}
/** The balance watch service. */
var BalanceWatch = class {
	ctx;
	store;
	deps;
	status;
	timer;
	refreshing;
	stopped = false;
	/**
	* @param ctx - host context (interval lifecycle rides the plugin fiber).
	* @param store - durable store (snapshots survive restarts).
	* @param deps - key ref, interval, and change notification.
	*/
	constructor(ctx, store, deps) {
		this.ctx = ctx;
		this.store = store;
		this.deps = deps;
		const stored = store.loadBalance();
		this.status = stored === void 0 ? {
			state: "unconfigured",
			snapshot: null,
			lastSuccessAt: null,
			lastErrorCode: null
		} : {
			state: "ok",
			snapshot: stored.snapshot,
			lastSuccessAt: stored.fetchedAtMs,
			lastErrorCode: null
		};
	}
	/** The current public status. */
	getStatus() {
		return this.status;
	}
	/** Start the periodic refresh (fires immediately, then on the interval). */
	start() {
		this.refreshNow();
		this.schedule();
	}
	/** Recursive scheduling: the interval re-reads the config every cycle, so a
	* settings edit to `refreshMinutes` applies at the next tick — and the
	* timer is never created before the first refresh settles. */
	schedule() {
		if (this.stopped || this.timer !== void 0) return;
		const minutes = Math.max(1, Math.round(this.deps.refreshMinutes()));
		this.timer = setTimeout(() => {
			this.timer = void 0;
			this.refreshNow().finally(() => {
				this.schedule();
			});
		}, minutes * 6e4);
		this.timer.unref?.();
	}
	/** Stop the periodic refresh (plugin teardown). */
	stop() {
		this.stopped = true;
		if (this.timer !== void 0) clearInterval(this.timer);
		this.timer = void 0;
	}
	/** Force one refresh now (manual refresh route). */
	async refreshNow() {
		if (this.refreshing === void 0) this.refreshing = this.perform().finally(() => {
			this.refreshing = void 0;
		});
		await this.refreshing;
		return this.status;
	}
	async perform() {
		if (this.stopped) return;
		const refName = this.deps.apiKeyRef();
		const apiKey = await resolveDeepseekApiKey(this.ctx, refName);
		if (apiKey === void 0) {
			this.status = {
				state: "unconfigured",
				snapshot: this.status.snapshot,
				lastSuccessAt: this.status.lastSuccessAt,
				lastErrorCode: "NO_KEY"
			};
			this.deps.onSettled?.();
			return;
		}
		const result = await fetchBalance(apiKey);
		if (result.ok) {
			const fetchedAt = Date.now();
			this.status = {
				state: "ok",
				snapshot: result.snapshot,
				lastSuccessAt: fetchedAt,
				lastErrorCode: null
			};
			this.store.saveBalance(result.snapshot, fetchedAt, "ok");
		} else this.status = {
			state: this.status.snapshot === null ? "unconfigured" : "stale",
			snapshot: this.status.snapshot,
			lastSuccessAt: this.status.lastSuccessAt,
			lastErrorCode: result.code
		};
		this.deps.onSettled?.();
	}
};
/** Route prefix owned by this plugin. */
const USAGE_API_PREFIX = "/api/deepseek-usage";
/**
* Whether the request's socket peer is loopback (127/8, ::1, v4-mapped).
*/
function isLoopbackSocket(req) {
	const address = req.socket.remoteAddress;
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
/** Whether a normalized hostname names the loopback authority (127/8, ::1, localhost). */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
	const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
	if (ipv4 !== null) return Number.parseInt(ipv4[1], 10) === 127;
	return false;
}
/**
* The DSH browser-trust fence, reproduced from the official
* api-request-trust semantics (Host must be loopback — no trustedHosts are
* declared by this plugin; `sec-fetch-site` must not be cross-site; a
* present Origin must be same-host). DNS-rebinding defense: over plain HTTP
* a browser attaches no Origin/Fetch-Metadata to reads, so the Host check is
* the one rebinding cannot forge.
*/
function isTrustedUsageRequest(req) {
	const host = req.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (!isLoopbackHostname(hostUrl.hostname)) return false;
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = req.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** The combined gate: trust fence + loopback socket. */
function isLoopbackClient(req) {
	return isLoopbackSocket(req) && isTrustedUsageRequest(req);
}
/** Write one JSON response with a no-referrer policy. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(payload);
}
/** Read a request body with a hard size cap (undefined when over/undecipherable). */
async function readCappedBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > 8192) return void 0;
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
/** Refuse a request whose content type is not application/json. */
function hasJsonContentType(req) {
	const contentType = req.headers["content-type"];
	if (typeof contentType !== "string") return false;
	return contentType.split(";")[0].trim().toLowerCase() === "application/json";
}
/**
* Build the /api/deepseek-usage route family.
* @param deps - store, balance watch, endpoint facts, pricing.
* @returns the exact routes to register on webServer.
*/
function makeUsageRoutes(deps) {
	const { store, balance } = deps;
	/** Guard helper: fence + method check, writing the refusal itself. */
	const guard = (req, res, method) => {
		if (!isLoopbackClient(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return false;
		}
		if (req.method !== method) {
			writeJson(res, 405, { error: `method not allowed: ${req.method}` });
			return false;
		}
		return true;
	};
	/** Assemble the sanitized stats payload (balance only for loopback clients). */
	const statsPayload = (req) => {
		const today = deps.trendDayKeys()[deps.trendDayKeys().length - 1];
		const trend = deps.trendDayKeys().map((dayKey) => store.dailyStats(dayKey));
		const daily = trend[trend.length - 1];
		const endpoint = deps.endpoint();
		const status = balance.getStatus();
		return {
			daily,
			trend,
			estimatedCost: deps.estimateDayCost(today),
			prices: deps.prices(),
			balance: isLoopbackClient(req) ? status.snapshot : null,
			balanceOmitted: !isLoopbackClient(req),
			balanceState: {
				state: status.state,
				lastSuccessAt: status.lastSuccessAt,
				lastErrorCode: status.lastErrorCode
			},
			meta: {
				timezone: "Asia/Shanghai",
				dataSource: "session logs via sessionProjections + sessionQuery (exact provider usage only)",
				endpointBaseUrl: endpoint.baseUrl,
				endpointMatching: endpoint.matches,
				providerId: endpoint.providerId,
				updatedAt: deps.now?.() ?? Date.now()
			}
		};
	};
	return [{
		kind: "exact",
		path: `${USAGE_API_PREFIX}/stats`,
		handler: async (req, res) => {
			if (!guard(req, res, "GET")) return;
			writeJson(res, 200, statsPayload(req));
		}
	}, {
		kind: "exact",
		path: `${USAGE_API_PREFIX}/refresh`,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			if (!hasJsonContentType(req)) {
				writeJson(res, 415, { error: "content-type must be application/json" });
				return;
			}
			if (await readCappedBody(req) === void 0) {
				writeJson(res, 413, { error: "request body too large" });
				return;
			}
			const status = await balance.refreshNow();
			writeJson(res, 200, {
				balance: status.snapshot,
				balanceState: {
					state: status.state,
					lastSuccessAt: status.lastSuccessAt,
					lastErrorCode: status.lastErrorCode
				}
			});
		}
	}];
}
//#endregion
//#region src/index.ts
/** Services required by the host plugin. */
const inject = [
	"sessionProjections",
	"sessionQuery",
	"settings",
	"credentials",
	"webServer"
];
/** Settings namespace of this plugin (the settings page edits it). */
const USAGE_SETTINGS_NAMESPACE = settingsNamespace("deepseek-usage");
/** Runtime schema for one pricing schedule (time-aware pricing engine). */
const TokenRatesSchema = z.object({
	cacheHitInputPricePerMillion: z.number().min(0).required(),
	cacheMissInputPricePerMillion: z.number().min(0).required(),
	outputPricePerMillion: z.number().min(0).required()
});
const PricingWindowSchema = z.object({
	id: z.string().required(),
	start: z.string().required(),
	end: z.string().required()
});
const ModelPricingSchema = z.object({
	model: z.string().required(),
	ratesByBand: z.dict(TokenRatesSchema).required()
});
const PricingScheduleSchema = z.object({
	id: z.string().required(),
	effectiveFrom: z.string().required(),
	timezone: z.string().default("Asia/Shanghai"),
	currency: z.string().default("CNY"),
	windows: z.array(PricingWindowSchema).required(),
	models: z.array(ModelPricingSchema).required()
});
/** Runtime schema for {@link Config}. */
const PriceEntrySchema = z.object({
	model: z.string().required(),
	cacheHitInputPricePerMillion: z.number().min(0).required(),
	cacheMissInputPricePerMillion: z.number().min(0).required(),
	outputPricePerMillion: z.number().min(0).required(),
	currency: z.string().default("CNY"),
	effectiveFrom: z.string().default("2026-04-24")
});
/** Runtime schema for {@link Config}. */
const Config = z.object({
	enabled: z.boolean().default(true),
	providerId: z.string().default(DEFAULT_DEEPSEEK_PROVIDER),
	balanceRefreshMinutes: z.number().step(1).min(1).default(10),
	pricingSchedules: z.array(PricingScheduleSchema),
	prices: z.array(PriceEntrySchema).default(DEFAULT_PRICE_ENTRIES)
});
/** Resolve the pricing configuration from a config, validated. */
function resolvePricingSet(config) {
	if (config.pricingSchedules !== void 0 && config.pricingSchedules.length > 0) {
		validatePricingScheduleSet({ schedules: config.pricingSchedules });
		return {
			schedules: config.pricingSchedules,
			mode: "schedules"
		};
	}
	if (config.prices !== void 0 && config.prices.length > 0) {
		config.prices.forEach(assertValidPriceEntry);
		return {
			schedules: buildSchedulesFromPriceEntries(config.prices),
			mode: "legacy"
		};
	}
	return {
		schedules: [LEGACY_SCHEDULE],
		mode: "legacy"
	};
}
/**
* Register the usage dashboard host half.
* @param ctx - host plugin context.
* @param config - resolved plugin config (schema defaults applied).
*/
function apply(ctx, config = {}) {
	let current = () => config ?? {};
	let store;
	let balance;
	let disposeCapture;
	const pricingSetOf = () => resolvePricingSet(current());
	/** Pricing-config identity (version + updated time) persisted in the store. */
	const pricesMeta = () => {
		const version = Number.parseInt(store?.metaGet("pricesVersion") ?? "1", 10);
		const updatedAt = store?.metaGet("pricesUpdatedAt") ?? null;
		const set = pricingSetOf();
		return {
			version: Number.isFinite(version) ? version : 1,
			updatedAt,
			mode: set.mode,
			timezone: set.schedules[0]?.timezone ?? "Asia/Shanghai",
			schedules: set.schedules.map((schedule) => ({
				id: schedule.id,
				effectiveFrom: schedule.effectiveFrom,
				currency: schedule.currency,
				windowCount: schedule.windows.length
			})),
			entries: set.mode === "legacy" ? current().prices ?? DEFAULT_PRICE_ENTRIES : []
		};
	};
	/**
	* Estimate one day's total cost over the stored rows. Every row is priced
	* at ITS OWN requestTime against the schedule set effective at that
	* instant — never "today's tokens × the current price". Unknown models
	* surface as unpriced instead of a guessed number.
	*/
	const estimateDayCost = (dayKey) => {
		const set = pricingSetOf();
		const { startMs, endMs } = dayRangeMs(dayKey);
		return aggregateDayCost(set.schedules, store === void 0 ? [] : store.rowsInRange(startMs, endMs));
	};
	/** Bump the pricing-config version when the effective schedule set changes. */
	const bumpPricingVersion = (previous, next) => {
		if (store === void 0) return;
		if (!pricingSetsEqual(previous, next)) {
			const version = Number.parseInt(store.metaGet("pricesVersion") ?? "0", 10);
			store.metaSet("pricesVersion", String(Number.isFinite(version) ? version + 1 : 1));
			store.metaSet("pricesUpdatedAt", (/* @__PURE__ */ new Date()).toISOString());
		}
	};
	const rebuild = () => {
		const source = current();
		if ((source.enabled ?? true) === false) {
			if (disposeCapture !== void 0) {
				disposeCapture();
				disposeCapture = void 0;
			}
			return;
		}
		if (disposeCapture !== void 0) {
			disposeCapture();
			disposeCapture = void 0;
		}
		const providerId = source.providerId ?? "deepseek-official";
		const endpoint = () => resolveDeepseekEndpoint(ctx, providerId);
		if (store === void 0) return;
		disposeCapture = registerUsageCapture(ctx, store, endpoint);
		scanAllSessions(ctx, store, endpoint).then((inserted) => {
			if (inserted > 0) ctx.logger.info(`deepseek-usage: catch-up scan inserted ${inserted} row(s)`);
		}).catch((error) => {
			ctx.logger.warn("deepseek-usage: catch-up scan failed", error instanceof Error ? error.message : String(error));
		});
	};
	let lastPricingSet;
	installSettingsSection(ctx, USAGE_SETTINGS_NAMESPACE, Config, config ?? {}, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {
			const next = pricingSetOf();
			if (lastPricingSet !== void 0) bumpPricingVersion(lastPricingSet, { schedules: next.schedules });
			lastPricingSet = { schedules: next.schedules };
			rebuild();
		}
	});
	if ((current().enabled ?? true) === false) return;
	store = new UsageStore(dshHomePath("deepseek-usage", "usage.db"));
	if (store.metaGet("pricesVersion") === void 0) {
		store.metaSet("pricesVersion", "1");
		store.metaSet("pricesUpdatedAt", (/* @__PURE__ */ new Date()).toISOString());
	}
	const providerId = current().providerId ?? "deepseek-official";
	const endpoint = () => resolveDeepseekEndpoint(ctx, providerId);
	balance = new BalanceWatch(ctx, store, {
		apiKeyRef: () => deepseekApiKeyRef(ctx),
		refreshMinutes: () => current().balanceRefreshMinutes ?? 10
	});
	balance.start();
	const disposeRoutes = makeUsageRoutes({
		store,
		balance,
		endpoint,
		prices: pricesMeta,
		estimateDayCost,
		trendDayKeys: () => recentDayKeys(dayKeyOf(Date.now()), 7)
	}).map((route) => ctx.webServer.register(route));
	disposeCapture = registerUsageCapture(ctx, store, endpoint);
	scanAllSessions(ctx, store, endpoint).then((inserted) => {
		if (inserted > 0) ctx.logger.info(`deepseek-usage: catch-up scan inserted ${inserted} row(s)`);
	}).catch((error) => {
		ctx.logger.warn("deepseek-usage: catch-up scan failed", error instanceof Error ? error.message : String(error));
	});
	ctx.effect(() => () => {
		disposeCapture?.();
		for (const dispose of disposeRoutes) dispose();
		balance?.stop();
		store?.close();
	}, "deepseek-usage: teardown");
}
//#endregion
export { ALL_DAY_WINDOW_ID, BALANCE_TIMEOUT_MS, BALANCE_URL, Config, DAY_TIMEZONE, DEEPSEEK_API_HOST, DEFAULT_DEEPSEEK_PROVIDER, LEGACY_SCHEDULE, OFF_PEAK_BAND_ID, USAGE_API_PREFIX, USAGE_SETTINGS_NAMESPACE, UsageStore, aggregateDayCost, apply, bucketsFromTokenUsage, buildSchedulesFromPriceEntries, dayKeyOf, dayRangeMs, dayRangeMsInTimezone, fetchBalance, inject, isInsideWindow, makeUsageRoutes, mapWireUsage, minuteOfDayInTimezone, normalizeEffectiveFrom, prepareScheduleSet, resolveDeepseekEndpoint, resolvePricing, sanitizeBalanceBody, validatePricingScheduleSet };
