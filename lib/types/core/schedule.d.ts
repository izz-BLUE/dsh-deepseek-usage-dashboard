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
import type { PriceEntry, TokenRates } from './pricing.ts';
/**
 * One daily time band. `start` inclusive, `end` exclusive, both in the
 * schedule's local wall clock ("HH:MM"; `end` may be "24:00"). A window
 * whose `start === end` covers the full day. `end < start` crosses midnight.
 * The optional `bandId` names the band this window's rates are keyed under —
 * several windows may share one band (default: the window's own id).
 */
export interface PricingWindow {
    id: string;
    /** Local wall-clock "HH:MM", inclusive. */
    start: string;
    /** Local wall-clock "HH:MM" or "24:00", exclusive. */
    end: string;
    /** The band id this window maps to (defaults to `id`; shareable). */
    bandId?: string;
}
/** One model's rates inside a schedule; `*` is an EXPLICIT user wildcard. */
export interface ModelPricing {
    /** Exact model id, or `*` when the user explicitly configured a fallback. */
    model: string;
    /** Rates by band id (window ids, or the implicit `off-peak` band). */
    ratesByBand: Record<string, TokenRates>;
}
/**
 * One versioned price table. `effectiveFrom` is an ISO 8601 instant with
 * offset (e.g. `2026-08-17T00:00:00+08:00`); legacy `YYYY-MM-DD` values are
 * normalized to midnight in the schedule's timezone on load.
 */
export interface PricingSchedule {
    id: string;
    /** ISO 8601 instant with offset — the inclusive effectiveness boundary. */
    effectiveFrom: string;
    /** IANA timezone id the windows and `effectiveFrom` are expressed in. */
    timezone: string;
    /** ISO 4217 currency code — one schedule set shares ONE currency. */
    currency: string;
    windows: PricingWindow[];
    models: ModelPricing[];
}
/** The full pricing configuration (one currency across all schedules). */
export interface PricingScheduleSet {
    schedules: PricingSchedule[];
}
/** The implicit band for minutes not covered by any declared window. */
export declare const OFF_PEAK_BAND_ID = "off-peak";
/** A window whose `start === end` covers the full day (all-day schedule). */
export declare const ALL_DAY_WINDOW_ID = "all-day";
/** The default timezone for schedules and legacy normalization. */
export declare const DEFAULT_SCHEDULE_TIMEZONE = "Asia/Shanghai";
/** Whether one minute-of-day falls inside one window (start inclusive, end exclusive). */
export declare function isInsideWindow(minuteOfDay: number, window: PricingWindow): boolean;
/** The band id covering one minute of day (a window's band, or implicit off-peak). */
export declare function bandForMinute(schedule: PricingSchedule, minuteOfDay: number): {
    bandId: string;
    window: PricingWindow | null;
};
/**
 * Normalize an `effectiveFrom` value into an ISO 8601 instant with offset.
 * A legacy `YYYY-MM-DD` becomes midnight in `timezone` (e.g.
 * `2026-04-24T00:00:00+08:00`), so existing configs keep working unchanged.
 */
export declare function normalizeEffectiveFrom(value: string, timezone: string): string;
/** The epoch-millisecond instant a schedule becomes effective (inclusive). */
export declare function effectiveFromEpochMs(schedule: PricingSchedule): number;
/** A schedule prepared for repeated resolution (effective instant precomputed). */
export interface PreparedSchedule {
    schedule: PricingSchedule;
    /** Epoch ms of the inclusive effectiveness boundary. */
    effectiveMs: number;
}
/**
 * Sort and precompute the effective instants of a schedule list. The
 * resolved schedule for a request is the one with the largest
 * `effectiveFrom <= requestTime` — later schedules never reprice earlier
 * requests, because the list is only ever scanned up to the request time.
 */
export declare function prepareScheduleSet(schedules: readonly PricingSchedule[]): PreparedSchedule[];
/** The outcome of pricing one usage row. */
export type ResolvedPricing = {
    status: 'priced';
    scheduleId: string;
    effectiveFrom: string;
    timezone: string;
    bandId: string;
    model: string;
    currency: string;
    rates: TokenRates;
} | {
    status: 'unpriced';
    model: string;
    reason: 'no-schedule' | 'unknown-model' | 'no-rates-for-band';
};
/**
 * Resolve the pricing of one model at one request instant.
 *
 * Selection: schedules with `effectiveFrom <= requestTime`, taking the
 * LATEST one; the request's wall clock in the schedule's timezone picks the
 * band; then an exact model match, then an EXPLICIT user `*` wildcard. Any
 * other outcome is `unpriced` — never thrown, never a silent fake number.
 */
export declare function resolvePricing(prepared: readonly PreparedSchedule[], model: string, requestTimeMs: number): ResolvedPricing;
/** Validate the whole schedule set; throws with a specific message. */
export declare function validatePricingScheduleSet(set: PricingScheduleSet): void;
/**
 * Build one all-day schedule per `effectiveFrom` group from a legacy
 * `PriceEntry[]` config (backward compatibility: existing `prices` keep
 * working, including user-configured `*` fallback rows).
 */
export declare function buildSchedulesFromPriceEntries(entries: readonly PriceEntry[]): PricingSchedule[];
/**
 * The built-in legacy schedule: the repository's current 2026-04-24 DeepSeek
 * table, migrated VERBATIM (only the numbers already present in this repo —
 * no new price is invented here). It deliberately has NO `*` fallback: a
 * built-in default must never silently price an unknown model.
 */
export declare const LEGACY_SCHEDULE: PricingSchedule;
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
export declare const DEEPSEEK_2026_08_17_SCHEDULE: PricingSchedule;
/**
 * The built-in default schedule set: the legacy 2026-04-24 table (prices
 * everything up to the 2026-08-17 boundary, so history never changes) plus
 * the official 2026-08-17 table. Requests at or after
 * `2026-08-17T00:00:00+08:00` are priced under the new time-aware schedule.
 */
export declare const DEFAULT_SCHEDULES: PricingSchedule[];
/** Structural equality of two schedule sets (pricing-config change detection). */
export declare function pricingSetsEqual(a: PricingScheduleSet, b: PricingScheduleSet): boolean;
/** One row priced by the aggregate: request time falls back to settlement time. */
export interface PricableRow {
    model: string;
    failed: boolean;
    cacheHit: number;
    cacheMiss: number;
    output: number;
    /** Settlement time (epoch ms) — the existing `time` field, untouched. */
    time: number;
    /** Request start time (epoch ms); historical rows use the settlement approximation. */
    requestTime: number;
}
/** One day's cost estimate with explicit priced/unpriced accounting. */
export interface DayCostEstimate {
    /** Total estimated cost as a decimal string in `currency` units. */
    total: string;
    /** Total estimated cost in integer micro-units (1e-6 of `currency`). */
    totalMicro: string;
    currency: string;
    /** Rows priced under a schedule (failed rows never count). */
    pricedRequestCount: number;
    /** Rows with usage that could not be priced (unknown model / no rates). */
    unpricedRequestCount: number;
    /** Tokens of the unpriced rows — NEVER folded into `total`. */
    unpriced: {
        cacheHitInputTokens: number;
        cacheMissInputTokens: number;
        outputTokens: number;
    };
    /** The schedule ids that priced this day (empty while everything is unpriced). */
    scheduleIdsUsed: string[];
}
/** The zero estimate (no store / no rows yet). */
export declare function emptyDayCostEstimate(currency?: string): DayCostEstimate;
/**
 * Aggregate one day's rows into a cost estimate. Every row is priced at its
 * OWN request time against the schedule set — never "today's tokens × the
 * current price". Failed rows carry no usage and are ignored entirely.
 */
export declare function aggregateDayCost(schedules: readonly PricingSchedule[], rows: readonly PricableRow[]): DayCostEstimate;
//# sourceMappingURL=schedule.d.ts.map