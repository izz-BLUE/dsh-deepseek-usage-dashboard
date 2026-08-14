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
    /** Per-model price table (editable in the settings page). */
    prices?: PriceEntry[];
}
/** Runtime schema for {@link Config}. */
export declare const Config: z<Config>;
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
export { dayKeyOf, dayRangeMs, DAY_TIMEZONE } from './core/day.ts';
export { resolveDeepseekEndpoint, DEEPSEEK_API_HOST, DEFAULT_DEEPSEEK_PROVIDER } from './host/endpoint.ts';
export type { PriceEntry } from './core/pricing.ts';
//# sourceMappingURL=index.d.ts.map