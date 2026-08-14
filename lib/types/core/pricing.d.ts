/**
 * Per-model price table for cost estimation.
 *
 * Prices are CONFIGURED, never hardcoded as immutable constants: the default
 * table below ships as the composition default and is fully editable in the
 * plugin settings page. Each entry prices one model (or `*` as the fallback)
 * per million tokens. Because DeepSeek adjusts prices over time, every entry
 * carries an `effectiveFrom` date and the dashboard displays the price-table
 * version and its last update time alongside every estimate.
 */
import type { UsageBuckets } from './mapping.ts';
import { type MicroAmount } from './money.ts';
/** One model's price entry (per million tokens, in `currency` units). */
export interface PriceEntry {
    /** Exact model id, or `*` for the fallback entry. */
    model: string;
    /** Price per million cache-HIT input tokens. */
    cacheHitInputPricePerMillion: number;
    /** Price per million cache-MISS input tokens. */
    cacheMissInputPricePerMillion: number;
    /** Price per million output tokens. */
    outputPricePerMillion: number;
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
 */
export declare const DEFAULT_PRICE_ENTRIES: PriceEntry[];
/** Resolve the entry pricing one model: exact match, then the `*` fallback. */
export declare function resolvePriceEntry(entries: readonly PriceEntry[], model: string): PriceEntry;
/** The estimated micro-unit cost of one usage row under one price entry. */
export interface CostBreakdown {
    cacheHit: MicroAmount;
    cacheMiss: MicroAmount;
    output: MicroAmount;
    /** cacheHit + cacheMiss + output. */
    total: MicroAmount;
}
/** Estimate one usage row's cost in micro-units (integer arithmetic only). */
export declare function costOfBuckets(entry: PriceEntry, buckets: UsageBuckets): CostBreakdown;
/** True when two price tables are structurally equal (change detection). */
export declare function priceEntriesEqual(a: readonly PriceEntry[], b: readonly PriceEntry[]): boolean;
/** Validate one configured price entry; throws with a specific message. */
export declare function assertValidPriceEntry(entry: PriceEntry, index: number): void;
//# sourceMappingURL=pricing.d.ts.map