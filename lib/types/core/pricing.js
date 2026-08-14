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
import { sumMicro, tokensCostMicro } from "./money.js";
/**
 * Default price table. Source: DeepSeek's public pricing page as of the
 * `effectiveFrom` dates. These are ESTIMATES — the dashboard labels every
 * amount as an estimate and never as an official bill, and the user can edit
 * the table in the settings page.
 */
export const DEFAULT_PRICE_ENTRIES = [
    {
        model: 'deepseek-v4-flash',
        cacheHitInputPricePerMillion: 0.02,
        cacheMissInputPricePerMillion: 1,
        outputPricePerMillion: 2,
        currency: 'CNY',
        effectiveFrom: '2026-04-24',
    },
    {
        model: 'deepseek-v4-pro',
        cacheHitInputPricePerMillion: 0.025,
        cacheMissInputPricePerMillion: 3,
        outputPricePerMillion: 6,
        currency: 'CNY',
        effectiveFrom: '2026-04-24',
    },
    {
        model: 'deepseek-chat',
        cacheHitInputPricePerMillion: 0.02,
        cacheMissInputPricePerMillion: 1,
        outputPricePerMillion: 2,
        currency: 'CNY',
        effectiveFrom: '2026-04-24',
    },
    {
        model: 'deepseek-reasoner',
        cacheHitInputPricePerMillion: 0.02,
        cacheMissInputPricePerMillion: 1,
        outputPricePerMillion: 2,
        currency: 'CNY',
        effectiveFrom: '2026-04-24',
    },
    {
        model: '*',
        cacheHitInputPricePerMillion: 0.02,
        cacheMissInputPricePerMillion: 1,
        outputPricePerMillion: 2,
        currency: 'CNY',
        effectiveFrom: '2026-04-24',
    },
];
/** Resolve the entry pricing one model: exact match, then the `*` fallback. */
export function resolvePriceEntry(entries, model) {
    const exact = entries.find(entry => entry.model === model);
    if (exact !== undefined)
        return exact;
    const fallback = entries.find(entry => entry.model === '*');
    if (fallback !== undefined)
        return fallback;
    throw new Error(`deepseek-usage: no price entry and no '*' fallback for model ${model}`);
}
/** Estimate one usage row's cost in micro-units (integer arithmetic only). */
export function costOfBuckets(entry, buckets) {
    const cacheHit = tokensCostMicro(buckets.cacheHitInputTokens, entry.cacheHitInputPricePerMillion);
    const cacheMiss = tokensCostMicro(buckets.cacheMissInputTokens, entry.cacheMissInputPricePerMillion);
    const output = tokensCostMicro(buckets.outputTokens, entry.outputPricePerMillion);
    return { cacheHit, cacheMiss, output, total: sumMicro([cacheHit, cacheMiss, output]) };
}
/** True when two price tables are structurally equal (change detection). */
export function priceEntriesEqual(a, b) {
    if (a.length !== b.length)
        return false;
    return a.every((entry, index) => {
        const other = b[index];
        return entry.model === other.model
            && entry.cacheHitInputPricePerMillion === other.cacheHitInputPricePerMillion
            && entry.cacheMissInputPricePerMillion === other.cacheMissInputPricePerMillion
            && entry.outputPricePerMillion === other.outputPricePerMillion
            && entry.currency === other.currency
            && entry.effectiveFrom === other.effectiveFrom;
    });
}
/** Validate one configured price entry; throws with a specific message. */
export function assertValidPriceEntry(entry, index) {
    const where = `price entry ${index} (${entry.model})`;
    if (entry.model.trim() === '')
        throw new Error(`deepseek-usage: ${where} has an empty model`);
    for (const [name, value] of [
        ['cacheHitInputPricePerMillion', entry.cacheHitInputPricePerMillion],
        ['cacheMissInputPricePerMillion', entry.cacheMissInputPricePerMillion],
        ['outputPricePerMillion', entry.outputPricePerMillion],
    ]) {
        if (!Number.isFinite(value) || value < 0)
            throw new Error(`deepseek-usage: ${where} ${name} must be a non-negative number`);
    }
    if (entry.currency.trim() === '')
        throw new Error(`deepseek-usage: ${where} has an empty currency`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.effectiveFrom)) {
        throw new Error(`deepseek-usage: ${where} effectiveFrom must be YYYY-MM-DD`);
    }
}
