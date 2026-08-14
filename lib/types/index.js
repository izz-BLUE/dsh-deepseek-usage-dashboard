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
import z from 'schemastery';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { DEFAULT_PRICE_ENTRIES, assertValidPriceEntry, costOfBuckets, priceEntriesEqual, resolvePriceEntry } from "./core/pricing.js";
import { recentDayKeys, dayRangeMs, dayKeyOf } from "./core/day.js";
import { formatMicro, sumMicro } from "./core/money.js";
import { UsageStore } from "./core/sqlite-store.js";
import { DEFAULT_DEEPSEEK_PROVIDER, deepseekApiKeyRef, resolveDeepseekEndpoint } from "./host/endpoint.js";
import { registerUsageCapture, scanAllSessions } from "./host/collector.js";
import { BalanceWatch } from "./host/balance-service.js";
import { makeUsageRoutes } from "./host/routes.js";
/** Services required by the host plugin. */
export const inject = ['sessionProjections', 'sessionQuery', 'settings', 'credentials', 'webServer'];
/** Settings namespace of this plugin (the settings page edits it). */
export const USAGE_SETTINGS_NAMESPACE = settingsNamespace('deepseek-usage');
/** Runtime schema for {@link Config}. */
const PriceEntrySchema = z.object({
    model: z.string().required(),
    cacheHitInputPricePerMillion: z.number().min(0).required(),
    cacheMissInputPricePerMillion: z.number().min(0).required(),
    outputPricePerMillion: z.number().min(0).required(),
    currency: z.string().default('CNY'),
    effectiveFrom: z.string().default('2026-04-24'),
});
/** Runtime schema for {@link Config}. */
export const Config = z.object({
    enabled: z.boolean().default(true),
    providerId: z.string().default(DEFAULT_DEEPSEEK_PROVIDER),
    balanceRefreshMinutes: z.number().step(1).min(1).default(10),
    prices: z.array(PriceEntrySchema).default(DEFAULT_PRICE_ENTRIES),
});
/** Resolve the current price entries from a config, validated. */
function resolvePrices(config) {
    const entries = config.prices ?? DEFAULT_PRICE_ENTRIES;
    entries.forEach(assertValidPriceEntry);
    return entries;
}
/**
 * Register the usage dashboard host half.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx, config = {}) {
    let current = () => config ?? {};
    let store;
    let balance;
    let disposeCapture;
    const pricesOf = () => resolvePrices(current());
    /** Price-table identity (version + updated time) persisted in the store. */
    const pricesMeta = () => {
        const version = Number.parseInt(store?.metaGet('pricesVersion') ?? '1', 10);
        const updatedAt = store?.metaGet('pricesUpdatedAt') ?? null;
        return { version: Number.isFinite(version) ? version : 1, updatedAt, entries: pricesOf() };
    };
    /** Estimate one day's total cost over the stored rows (per-model prices). */
    const estimateDayCost = (dayKey) => {
        if (store === undefined)
            return { total: '0', totalMicro: '0', currency: 'CNY' };
        const entries = pricesOf();
        const { startMs, endMs } = dayRangeMs(dayKey);
        const rows = store.rowsInRange(startMs, endMs);
        const total = sumMicro(rows.map((row) => {
            if (row.failed)
                return 0n;
            return costOfBuckets(resolvePriceEntry(entries, row.model), {
                cacheHitInputTokens: row.cacheHit,
                cacheMissInputTokens: row.cacheMiss,
                outputTokens: row.output,
                reasoningTokens: row.reasoning,
                totalInputTokens: row.cacheHit + row.cacheMiss,
                totalTokens: row.cacheHit + row.cacheMiss + row.output,
            }).total;
        }));
        const currency = entries[0]?.currency ?? 'CNY';
        return { total: formatMicro(total, 6), totalMicro: total.toString(), currency };
    };
    /** Bump the price-table version when the configured prices change. */
    const bumpPriceVersion = (previous) => {
        if (store === undefined)
            return;
        if (!priceEntriesEqual(resolvePrices(current()), previous)) {
            const version = Number.parseInt(store.metaGet('pricesVersion') ?? '0', 10);
            store.metaSet('pricesVersion', String(Number.isFinite(version) ? version + 1 : 1));
            store.metaSet('pricesUpdatedAt', new Date().toISOString());
        }
    };
    const rebuild = () => {
        const source = current();
        if ((source.enabled ?? true) === false) {
            if (disposeCapture !== undefined) {
                disposeCapture();
                disposeCapture = undefined;
            }
            return;
        }
        // Re-register the live capture when the provider id / endpoint changed.
        if (disposeCapture !== undefined) {
            disposeCapture();
            disposeCapture = undefined;
        }
        const providerId = source.providerId ?? DEFAULT_DEEPSEEK_PROVIDER;
        const endpoint = () => resolveDeepseekEndpoint(ctx, providerId);
        if (store === undefined)
            return;
        disposeCapture = registerUsageCapture(ctx, store, endpoint);
        // Catch-up scan for sessions that settled before this plugin loaded;
        // idempotent (INSERT OR IGNORE), so repeated runs are safe.
        void scanAllSessions(ctx, store, endpoint).then((inserted) => {
            if (inserted > 0)
                ctx.logger.info(`deepseek-usage: catch-up scan inserted ${inserted} row(s)`);
        }).catch((error) => {
            ctx.logger.warn('deepseek-usage: catch-up scan failed', error instanceof Error ? error.message : String(error));
        });
    };
    // The authoritative configuration source: the settings scope once the web
    // settings surface serves the namespace, the composition entry otherwise.
    installSettingsSection(ctx, USAGE_SETTINGS_NAMESPACE, Config, config ?? {}, {
        setSource: (source) => { current = source; },
        onChange: () => {
            bumpPriceVersion(resolvePrices(current()));
            rebuild();
        },
    });
    if ((current().enabled ?? true) === false)
        return;
    // Durable store under the DSH home (machine-level, survives restarts).
    const dbPath = dshHomePath('deepseek-usage', 'usage.db');
    store = new UsageStore(dbPath);
    if (store.metaGet('pricesVersion') === undefined) {
        store.metaSet('pricesVersion', '1');
        store.metaSet('pricesUpdatedAt', new Date().toISOString());
    }
    const providerId = current().providerId ?? DEFAULT_DEEPSEEK_PROVIDER;
    const endpoint = () => resolveDeepseekEndpoint(ctx, providerId);
    balance = new BalanceWatch(ctx, store, {
        apiKeyRef: () => deepseekApiKeyRef(ctx),
        refreshMinutes: () => current().balanceRefreshMinutes ?? 10,
    });
    balance.start();
    const routes = makeUsageRoutes({
        store,
        balance,
        endpoint,
        prices: pricesMeta,
        estimateDayCost,
        trendDayKeys: () => recentDayKeys(dayKeyOf(Date.now()), 7),
    });
    const disposeRoutes = routes.map(route => ctx.webServer.register(route));
    disposeCapture = registerUsageCapture(ctx, store, endpoint);
    void scanAllSessions(ctx, store, endpoint).then((inserted) => {
        if (inserted > 0)
            ctx.logger.info(`deepseek-usage: catch-up scan inserted ${inserted} row(s)`);
    }).catch((error) => {
        ctx.logger.warn('deepseek-usage: catch-up scan failed', error instanceof Error ? error.message : String(error));
    });
    ctx.effect(() => () => {
        disposeCapture?.();
        for (const dispose of disposeRoutes)
            dispose();
        balance?.stop();
        store?.close();
    }, 'deepseek-usage: teardown');
}
export { USAGE_API_PREFIX } from "./host/routes.js";
export { makeUsageRoutes } from "./host/routes.js";
export { UsageStore } from "./core/sqlite-store.js";
export { fetchBalance, sanitizeBalanceBody, BALANCE_URL, BALANCE_TIMEOUT_MS } from "./core/balance.js";
export { mapWireUsage, bucketsFromTokenUsage } from "./core/mapping.js";
export { dayKeyOf, dayRangeMs, DAY_TIMEZONE } from "./core/day.js";
export { resolveDeepseekEndpoint, DEEPSEEK_API_HOST, DEFAULT_DEEPSEEK_PROVIDER } from "./host/endpoint.js";
