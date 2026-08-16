/**
 * Per-model price table for cost estimation.
 *
 * Prices are CONFIGURED, never hardcoded as immutable constants: the default
 * table below ships as the composition default and is fully editable in the
 * plugin settings page. Each entry prices one model per million tokens.
 *
 * @deprecated The time-aware {@link PricingSchedule} engine replaces this
 * flat table. `PriceEntry` is kept for backward compatibility: legacy
 * `prices` configs normalize into an all-day schedule (see
 * `buildSchedulesFromPriceEntries` in `schedule.ts`). The built-in default
 * deliberately ships NO `*` fallback entry — an unknown model must surface
 * as UNPRICED, not as a silently guessed Flash price.
 */
import type { UsageBuckets } from './mapping.ts';
import { type MicroAmount } from './money.ts';
/** One model's rates per million tokens (the cost math only needs these). */
export interface TokenRates {
    /** Price per million cache-HIT input tokens. */
    cacheHitInputPricePerMillion: number;
    /** Price per million cache-MISS input tokens. */
    cacheMissInputPricePerMillion: number;
    /** Price per million output tokens. */
    outputPricePerMillion: number;
}
/** One model's price entry (per million tokens, in `currency` units). */
export interface PriceEntry extends TokenRates {
    /** Exact model id, or `*` for a user-configured fallback entry. */
    model: string;
    /** ISO 4217 currency code the prices are quoted in. */
    currency: string;
    /** ISO date (YYYY-MM-DD) this entry's prices took effect. */
    effectiveFrom: string;
}
/**
 * Default price table. Source: DeepSeek's public pricing page as of the
 * `effectiveFrom` dates. These are ESTIMATES — the dashboard labels every
 * amount as an estimate and never as an official bill, and the user can edit
 * the table in the settings page.
 *
 * No `*` fallback is shipped: the engine treats unknown models as UNPRICED
 * unless the user explicitly configures a wildcard row.
 */
export declare const DEFAULT_PRICE_ENTRIES: PriceEntry[];
/**
 * Resolve the entry pricing one model: exact match, then the `*` fallback.
 * @deprecated Use `resolvePricing` from `schedule.ts` (time-aware). This
 * legacy lookup ignores `effectiveFrom` entirely.
 */
export declare function resolvePriceEntry(entries: readonly PriceEntry[], model: string): PriceEntry;
/** The estimated micro-unit cost of one usage row under one rates object. */
export interface CostBreakdown {
    cacheHit: MicroAmount;
    cacheMiss: MicroAmount;
    output: MicroAmount;
    /** cacheHit + cacheMiss + output. */
    total: MicroAmount;
}
/** Estimate one usage row's cost in micro-units (integer arithmetic only). */
export declare function costOfBuckets(rates: TokenRates, buckets: UsageBuckets): CostBreakdown;
/** True when two price tables are structurally equal (change detection). */
export declare function priceEntriesEqual(a: readonly PriceEntry[], b: readonly PriceEntry[]): boolean;
/** Validate one configured price entry; throws with a specific message. */
export declare function assertValidPriceEntry(entry: PriceEntry, index: number): void;
//# sourceMappingURL=pricing.d.ts.map