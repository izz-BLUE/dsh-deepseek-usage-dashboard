/**
 * dsh-deepseek-usage-dashboard — Host half.
 *
 * Captures exact DeepSeek usage from session logs (projection + catch-up
 * scan), persists it idempotently into SQLite, estimates per-model cost with
 * integer micro-unit arithmetic, watches the DeepSeek balance, and serves
 * the /api/deepseek-usage route family. No LLM interface is ever called:
 * the only network traffic this plugin performs is the direct Host fetch to
 * the fixed https://api.deepseek.com/user/balance endpoint.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
import { type PriceEntry } from './core/pricing.ts';
import { type PricingSchedule } from './core/schedule.ts';
import { type PricingMode } from './host/routes.ts';
/** Services required by the host plugin. */
export declare const inject: string[];
/** Settings namespace of this plugin (the settings page edits it). */
export declare const USAGE_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Plugin configuration. */
export interface Config {
    /** Master switch for capture, balance watch, and routes. */
    enabled?: boolean;
    /** Provider route id counted as DeepSeek (official adapter default). */
    providerId?: string;
    /** Balance refresh interval in minutes. */
    balanceRefreshMinutes?: number;
    /**
     * Time-aware pricing schedules (the new engine). When present (and
     * non-empty) this takes precedence over the legacy `prices` table.
     */
    pricingSchedules?: PricingSchedule[];
    /**
     * Legacy per-model price table. Still fully supported: it normalizes into
     * an all-day legacy schedule. Ignored while `pricingSchedules` is set.
     * @deprecated prefer `pricingSchedules`.
     */
    prices?: PriceEntry[];
}
/** Runtime schema for {@link Config}. */
export declare const Config: z<Config>;
/** How the pricing config is expressed (drives API/UI provenance). */
export type { PricingMode } from './host/routes.ts';
/** The resolved schedule set plus how it was expressed. */
export interface ResolvedPricingSet {
    schedules: PricingSchedule[];
    mode: PricingMode;
}
/**
 * Resolve the pricing configuration from a config, validated.
 * Exported so the upgrade-compatibility gate can assert the exact
 * builtin-default vs custom-legacy decision table.
 */
export declare function resolvePricingSet(config: Config): ResolvedPricingSet;
/**
 * Register the usage dashboard host half.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export declare function apply(ctx: Context, config?: Config): void;
export { USAGE_API_PREFIX } from './host/routes.ts';
export { makeUsageRoutes } from './host/routes.ts';
export { UsageStore } from './core/sqlite-store.ts';
export { fetchBalance, sanitizeBalanceBody, BALANCE_URL, BALANCE_TIMEOUT_MS } from './core/balance.ts';
export { mapWireUsage, bucketsFromTokenUsage } from './core/mapping.ts';
export { dayKeyOf, dayRangeMs, DAY_TIMEZONE, minuteOfDayInTimezone, dayRangeMsInTimezone } from './core/day.ts';
export { resolveDeepseekEndpoint, DEEPSEEK_API_HOST, DEFAULT_DEEPSEEK_PROVIDER } from './host/endpoint.ts';
export { DEFAULT_SCHEDULES, DEEPSEEK_2026_08_17_SCHEDULE, LEGACY_SCHEDULE, aggregateDayCost, bandForMinute, buildSchedulesFromPriceEntries, validatePricingScheduleSet, prepareScheduleSet, resolvePricing, normalizeEffectiveFrom, isInsideWindow, OFF_PEAK_BAND_ID, ALL_DAY_WINDOW_ID, } from './core/schedule.ts';
export type { PriceEntry, TokenRates } from './core/pricing.ts';
export { DEFAULT_PRICE_ENTRIES, OLD_BUILTIN_DEFAULT_PRICE_ENTRIES, isLegacyBuiltinDefaultPrices, resolvePriceEntry, priceEntriesEqual, } from './core/pricing.ts';
export type { PricingSchedule, PricingScheduleSet, PricingWindow, ModelPricing, ResolvedPricing, DayCostEstimate, } from './core/schedule.ts';
//# sourceMappingURL=index.d.ts.map