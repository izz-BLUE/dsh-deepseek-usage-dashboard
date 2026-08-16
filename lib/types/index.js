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
import { DEFAULT_PRICE_ENTRIES, assertValidPriceEntry, isLegacyBuiltinDefaultPrices } from "./core/pricing.js";
import { DEFAULT_SCHEDULES, aggregateDayCost, bandForMinute, buildSchedulesFromPriceEntries, prepareScheduleSet, pricingSetsEqual, validatePricingScheduleSet, } from "./core/schedule.js";
import { recentDayKeys, dayRangeMs, dayKeyOf, minuteOfDayInTimezone } from "./core/day.js";
import { UsageStore } from "./core/sqlite-store.js";
import { DEFAULT_DEEPSEEK_PROVIDER, deepseekApiKeyRef, resolveDeepseekEndpoint } from "./host/endpoint.js";
import { registerUsageCapture, scanAllSessions } from "./host/collector.js";
import { BalanceWatch } from "./host/balance-service.js";
import { makeUsageRoutes } from "./host/routes.js";
/** Services required by the host plugin. */
export const inject = ['sessionProjections', 'sessionQuery', 'settings', 'credentials', 'webServer'];
/** Settings namespace of this plugin (the settings page edits it). */
export const USAGE_SETTINGS_NAMESPACE = settingsNamespace('deepseek-usage');
/** Runtime schema for one pricing schedule (time-aware pricing engine). */
const TokenRatesSchema = z.object({
    cacheHitInputPricePerMillion: z.number().min(0).required(),
    cacheMissInputPricePerMillion: z.number().min(0).required(),
    outputPricePerMillion: z.number().min(0).required(),
});
const PricingWindowSchema = z.object({
    id: z.string().required(),
    start: z.string().required(),
    end: z.string().required(),
    // Optional: several windows may share one band (default: the window id).
    bandId: z.string(),
});
const ModelPricingSchema = z.object({
    model: z.string().required(),
    ratesByBand: z.dict(TokenRatesSchema).required(),
});
const PricingScheduleSchema = z.object({
    id: z.string().required(),
    effectiveFrom: z.string().required(),
    timezone: z.string().default('Asia/Shanghai'),
    currency: z.string().default('CNY'),
    windows: z.array(PricingWindowSchema).required(),
    models: z.array(ModelPricingSchema).required(),
});
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
    pricingSchedules: z.array(PricingScheduleSchema),
    // NO default here on purpose: when the user never configured `prices`,
    // the resolution falls through to the built-in DEFAULT_SCHEDULES (legacy
    // + official 2026-08-17). A default array would shadow the built-in
    // time-aware schedule and keep everyone on the old flat table forever.
    prices: z.array(PriceEntrySchema),
});
/**
 * Resolve the pricing configuration from a config, validated.
 * Exported so the upgrade-compatibility gate can assert the exact
 * builtin-default vs custom-legacy decision table.
 */
export function resolvePricingSet(config) {
    // New engine first: explicitly configured schedules win over everything.
    if (config.pricingSchedules !== undefined && config.pricingSchedules.length > 0) {
        validatePricingScheduleSet({ schedules: config.pricingSchedules });
        return { schedules: config.pricingSchedules, mode: 'time-aware' };
    }
    // Legacy `prices`: user-configured rows keep working (including explicit
    // `*` wildcard rows), normalized into one all-day schedule per date. An
    // explicitly configured legacy table keeps applying to ALL dates — the
    // built-in 2026-08-17 change only ships with the default configuration.
    if (config.prices !== undefined && config.prices.length > 0) {
        config.prices.forEach(assertValidPriceEntry);
        // Upgrade compatibility (v0.1.0 → v0.2.0): the old settings schema
        // PERSISTED its built-in default table into `prices`, so presence alone
        // is not a customization signal. A structural match against the v0.1.0
        // built-in table (order-insensitive) is treated as an implicit default
        // and auto-transitions to DEFAULT_SCHEDULES — upgrading users get the
        // official 2026-08-17 pricing without manually deleting their prices.
        if (isLegacyBuiltinDefaultPrices(config.prices)) {
            return { schedules: DEFAULT_SCHEDULES, mode: 'time-aware' };
        }
        return { schedules: buildSchedulesFromPriceEntries(config.prices), mode: 'legacy' };
    }
    // No configuration at all: built-in legacy + official 2026-08-17 schedules
    // (requests before the boundary keep the legacy price forever).
    return { schedules: DEFAULT_SCHEDULES, mode: 'time-aware' };
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
    const pricingSetOf = () => resolvePricingSet(current());
    /** Pricing-config identity (version + updated time) persisted in the store. */
    const pricesMeta = () => {
        const version = Number.parseInt(store?.metaGet('pricesVersion') ?? '1', 10);
        const updatedAt = store?.metaGet('pricesUpdatedAt') ?? null;
        const set = pricingSetOf();
        return {
            version: Number.isFinite(version) ? version : 1,
            updatedAt,
            mode: set.mode,
            timezone: set.schedules[0]?.timezone ?? 'Asia/Shanghai',
            schedules: set.schedules.map(schedule => ({
                id: schedule.id,
                effectiveFrom: schedule.effectiveFrom,
                currency: schedule.currency,
                windowCount: schedule.windows.length,
            })),
            // The band the CURRENT instant falls into (lightweight UI hint — an
            // estimate aid, never a billing claim). Computed against the latest
            // effective schedule in the schedule's own timezone.
            currentBand: (() => {
                const now = Date.now();
                const prepared = prepareScheduleSet(set.schedules);
                let active;
                for (const candidate of prepared) {
                    if (candidate.effectiveMs <= now)
                        active = candidate;
                    else
                        break;
                }
                if (active === undefined)
                    return null;
                const band = bandForMinute(active.schedule, minuteOfDayInTimezone(now, active.schedule.timezone));
                return {
                    scheduleId: active.schedule.id,
                    bandId: band.bandId,
                    windowId: band.window?.id ?? null,
                    timezone: active.schedule.timezone,
                };
            })(),
            // Legacy display rows (kept for API compatibility; the time-aware
            // engine prices rows from the schedules, not from these entries).
            entries: set.mode === 'legacy'
                ? (current().prices ?? DEFAULT_PRICE_ENTRIES)
                : [],
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
        return aggregateDayCost(set.schedules, store === undefined ? [] : store.rowsInRange(startMs, endMs));
    };
    /** Bump the pricing-config version when the effective schedule set changes. */
    const bumpPricingVersion = (previous, next) => {
        if (store === undefined)
            return;
        if (!pricingSetsEqual(previous, next)) {
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
    // `lastPricingSet` remembers the last seen config so the version only bumps
    // when the effective schedule set actually changed.
    let lastPricingSet;
    installSettingsSection(ctx, USAGE_SETTINGS_NAMESPACE, Config, config ?? {}, {
        setSource: (source) => { current = source; },
        onChange: () => {
            const next = pricingSetOf();
            if (lastPricingSet !== undefined)
                bumpPricingVersion(lastPricingSet, { schedules: next.schedules });
            lastPricingSet = { schedules: next.schedules };
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
export { dayKeyOf, dayRangeMs, DAY_TIMEZONE, minuteOfDayInTimezone, dayRangeMsInTimezone } from "./core/day.js";
export { resolveDeepseekEndpoint, DEEPSEEK_API_HOST, DEFAULT_DEEPSEEK_PROVIDER } from "./host/endpoint.js";
export { DEFAULT_SCHEDULES, DEEPSEEK_2026_08_17_SCHEDULE, LEGACY_SCHEDULE, aggregateDayCost, bandForMinute, buildSchedulesFromPriceEntries, validatePricingScheduleSet, prepareScheduleSet, resolvePricing, normalizeEffectiveFrom, isInsideWindow, OFF_PEAK_BAND_ID, ALL_DAY_WINDOW_ID, } from "./core/schedule.js";
export { DEFAULT_PRICE_ENTRIES, OLD_BUILTIN_DEFAULT_PRICE_ENTRIES, isLegacyBuiltinDefaultPrices, resolvePriceEntry, priceEntriesEqual, } from "./core/pricing.js";
