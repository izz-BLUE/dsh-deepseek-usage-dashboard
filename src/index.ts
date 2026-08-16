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

import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import { DEFAULT_PRICE_ENTRIES, assertValidPriceEntry, type PriceEntry } from './core/pricing.ts'
import {
  LEGACY_SCHEDULE,
  aggregateDayCost,
  buildSchedulesFromPriceEntries,
  pricingSetsEqual,
  validatePricingScheduleSet,
  type DayCostEstimate,
  type PricingSchedule,
  type PricingScheduleSet,
} from './core/schedule.ts'
import { recentDayKeys, dayRangeMs, dayKeyOf } from './core/day.ts'
import { UsageStore } from './core/sqlite-store.ts'
import { DEFAULT_DEEPSEEK_PROVIDER, deepseekApiKeyRef, resolveDeepseekEndpoint } from './host/endpoint.ts'
import { registerUsageCapture, scanAllSessions } from './host/collector.ts'
import { BalanceWatch } from './host/balance-service.ts'
import { makeUsageRoutes, type PriceTableMeta, type PricingMode } from './host/routes.ts'

/** Services required by the host plugin. */
export const inject = ['sessionProjections', 'sessionQuery', 'settings', 'credentials', 'webServer']

/** Settings namespace of this plugin (the settings page edits it). */
export const USAGE_SETTINGS_NAMESPACE = settingsNamespace('deepseek-usage')

/** Plugin configuration. */
export interface Config {
  /** Master switch for capture, balance watch, and routes. */
  enabled?: boolean
  /** Provider route id counted as DeepSeek (official adapter default). */
  providerId?: string
  /** Balance refresh interval in minutes. */
  balanceRefreshMinutes?: number
  /**
   * Time-aware pricing schedules (the new engine). When present (and
   * non-empty) this takes precedence over the legacy `prices` table.
   */
  pricingSchedules?: PricingSchedule[]
  /**
   * Legacy per-model price table. Still fully supported: it normalizes into
   * an all-day legacy schedule. Ignored while `pricingSchedules` is set.
   * @deprecated prefer `pricingSchedules`.
   */
  prices?: PriceEntry[]
}

/** Runtime schema for one pricing schedule (time-aware pricing engine). */
const TokenRatesSchema = z.object({
  cacheHitInputPricePerMillion: z.number().min(0).required(),
  cacheMissInputPricePerMillion: z.number().min(0).required(),
  outputPricePerMillion: z.number().min(0).required(),
})

const PricingWindowSchema = z.object({
  id: z.string().required(),
  start: z.string().required(),
  end: z.string().required(),
})

const ModelPricingSchema = z.object({
  model: z.string().required(),
  ratesByBand: z.dict(TokenRatesSchema).required(),
})

const PricingScheduleSchema = z.object({
  id: z.string().required(),
  effectiveFrom: z.string().required(),
  timezone: z.string().default('Asia/Shanghai'),
  currency: z.string().default('CNY'),
  windows: z.array(PricingWindowSchema).required(),
  models: z.array(ModelPricingSchema).required(),
})

/** Runtime schema for {@link Config}. */
const PriceEntrySchema = z.object({
  model: z.string().required(),
  cacheHitInputPricePerMillion: z.number().min(0).required(),
  cacheMissInputPricePerMillion: z.number().min(0).required(),
  outputPricePerMillion: z.number().min(0).required(),
  currency: z.string().default('CNY'),
  effectiveFrom: z.string().default('2026-04-24'),
})

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  providerId: z.string().default(DEFAULT_DEEPSEEK_PROVIDER),
  balanceRefreshMinutes: z.number().step(1).min(1).default(10),
  pricingSchedules: z.array(PricingScheduleSchema),
  prices: z.array(PriceEntrySchema).default(DEFAULT_PRICE_ENTRIES),
})

/** How the pricing config is expressed (drives API/UI provenance). */
export type { PricingMode } from './host/routes.ts'

/** The resolved schedule set plus how it was expressed. */
export interface ResolvedPricingSet {
  schedules: PricingSchedule[]
  mode: PricingMode
}

/** Resolve the pricing configuration from a config, validated. */
function resolvePricingSet(config: Config): ResolvedPricingSet {
  // New engine first: explicitly configured schedules win over the legacy table.
  if (config.pricingSchedules !== undefined && config.pricingSchedules.length > 0) {
    validatePricingScheduleSet({ schedules: config.pricingSchedules })
    return { schedules: config.pricingSchedules, mode: 'schedules' }
  }
  // Legacy `prices`: user-configured rows keep working (including explicit
  // `*` wildcard rows), normalized into one all-day schedule per date.
  if (config.prices !== undefined && config.prices.length > 0) {
    config.prices.forEach(assertValidPriceEntry)
    return { schedules: buildSchedulesFromPriceEntries(config.prices), mode: 'legacy' }
  }
  // No configuration at all: the built-in legacy schedule (current behavior).
  return { schedules: [LEGACY_SCHEDULE], mode: 'legacy' }
}

/**
 * Register the usage dashboard host half.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx: Context, config: Config = {}): void {
  let current: () => Config = () => config ?? {}
  let store: UsageStore | undefined
  let balance: BalanceWatch | undefined
  let disposeCapture: (() => void) | undefined

  const pricingSetOf = (): ResolvedPricingSet => resolvePricingSet(current())

  /** Pricing-config identity (version + updated time) persisted in the store. */
  const pricesMeta = (): PriceTableMeta => {
    const version = Number.parseInt(store?.metaGet('pricesVersion') ?? '1', 10)
    const updatedAt = store?.metaGet('pricesUpdatedAt') ?? null
    const set = pricingSetOf()
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
      // Legacy display rows (kept for API compatibility; the time-aware
      // engine prices rows from the schedules, not from these entries).
      entries: set.mode === 'legacy'
        ? (current().prices ?? DEFAULT_PRICE_ENTRIES)
        : [],
    }
  }

  /**
   * Estimate one day's total cost over the stored rows. Every row is priced
   * at ITS OWN requestTime against the schedule set effective at that
   * instant — never "today's tokens × the current price". Unknown models
   * surface as unpriced instead of a guessed number.
   */
  const estimateDayCost = (dayKey: string): DayCostEstimate => {
    const set = pricingSetOf()
    const { startMs, endMs } = dayRangeMs(dayKey)
    return aggregateDayCost(set.schedules, store === undefined ? [] : store.rowsInRange(startMs, endMs))
  }

  /** Bump the pricing-config version when the effective schedule set changes. */
  const bumpPricingVersion = (previous: PricingScheduleSet, next: PricingScheduleSet): void => {
    if (store === undefined) return
    if (!pricingSetsEqual(previous, next)) {
      const version = Number.parseInt(store.metaGet('pricesVersion') ?? '0', 10)
      store.metaSet('pricesVersion', String(Number.isFinite(version) ? version + 1 : 1))
      store.metaSet('pricesUpdatedAt', new Date().toISOString())
    }
  }

  const rebuild = (): void => {
    const source = current()
    if ((source.enabled ?? true) === false) {
      if (disposeCapture !== undefined) {
        disposeCapture()
        disposeCapture = undefined
      }
      return
    }
    // Re-register the live capture when the provider id / endpoint changed.
    if (disposeCapture !== undefined) {
      disposeCapture()
      disposeCapture = undefined
    }
    const providerId = source.providerId ?? DEFAULT_DEEPSEEK_PROVIDER
    const endpoint = () => resolveDeepseekEndpoint(ctx, providerId)
    if (store === undefined) return
    disposeCapture = registerUsageCapture(ctx, store, endpoint)
    // Catch-up scan for sessions that settled before this plugin loaded;
    // idempotent (INSERT OR IGNORE), so repeated runs are safe.
    void scanAllSessions(ctx, store, endpoint).then((inserted) => {
      if (inserted > 0) ctx.logger.info(`deepseek-usage: catch-up scan inserted ${inserted} row(s)`)
    }).catch((error: unknown) => {
      ctx.logger.warn('deepseek-usage: catch-up scan failed', error instanceof Error ? error.message : String(error))
    })
  }

  // The authoritative configuration source: the settings scope once the web
  // settings surface serves the namespace, the composition entry otherwise.
  // `lastPricingSet` remembers the last seen config so the version only bumps
  // when the effective schedule set actually changed.
  let lastPricingSet: PricingScheduleSet | undefined
  installSettingsSection(ctx, USAGE_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => { current = source },
    onChange: () => {
      const next = pricingSetOf()
      if (lastPricingSet !== undefined) bumpPricingVersion(lastPricingSet, { schedules: next.schedules })
      lastPricingSet = { schedules: next.schedules }
      rebuild()
    },
  })

  if ((current().enabled ?? true) === false) return

  // Durable store under the DSH home (machine-level, survives restarts).
  const dbPath = dshHomePath('deepseek-usage', 'usage.db')
  store = new UsageStore(dbPath)
  if (store.metaGet('pricesVersion') === undefined) {
    store.metaSet('pricesVersion', '1')
    store.metaSet('pricesUpdatedAt', new Date().toISOString())
  }

  const providerId = current().providerId ?? DEFAULT_DEEPSEEK_PROVIDER
  const endpoint = () => resolveDeepseekEndpoint(ctx, providerId)

  balance = new BalanceWatch(ctx, store, {
    apiKeyRef: () => deepseekApiKeyRef(ctx),
    refreshMinutes: () => current().balanceRefreshMinutes ?? 10,
  })
  balance.start()

  const routes = makeUsageRoutes({
    store,
    balance,
    endpoint,
    prices: pricesMeta,
    estimateDayCost,
    trendDayKeys: () => recentDayKeys(dayKeyOf(Date.now()), 7),
  })
  const disposeRoutes = routes.map(route => ctx.webServer.register(route))

  disposeCapture = registerUsageCapture(ctx, store, endpoint)
  void scanAllSessions(ctx, store, endpoint).then((inserted) => {
    if (inserted > 0) ctx.logger.info(`deepseek-usage: catch-up scan inserted ${inserted} row(s)`)
  }).catch((error: unknown) => {
    ctx.logger.warn('deepseek-usage: catch-up scan failed', error instanceof Error ? error.message : String(error))
  })

  ctx.effect(() => () => {
    disposeCapture?.()
    for (const dispose of disposeRoutes) dispose()
    balance?.stop()
    store?.close()
  }, 'deepseek-usage: teardown')
}

export { USAGE_API_PREFIX } from './host/routes.ts'
export { makeUsageRoutes } from './host/routes.ts'
export { UsageStore } from './core/sqlite-store.ts'
export { fetchBalance, sanitizeBalanceBody, BALANCE_URL, BALANCE_TIMEOUT_MS } from './core/balance.ts'
export { mapWireUsage, bucketsFromTokenUsage } from './core/mapping.ts'
export { dayKeyOf, dayRangeMs, DAY_TIMEZONE, minuteOfDayInTimezone, dayRangeMsInTimezone } from './core/day.ts'
export { resolveDeepseekEndpoint, DEEPSEEK_API_HOST, DEFAULT_DEEPSEEK_PROVIDER } from './host/endpoint.ts'
export {
  LEGACY_SCHEDULE,
  aggregateDayCost,
  buildSchedulesFromPriceEntries,
  validatePricingScheduleSet,
  prepareScheduleSet,
  resolvePricing,
  normalizeEffectiveFrom,
  isInsideWindow,
  OFF_PEAK_BAND_ID,
  ALL_DAY_WINDOW_ID,
} from './core/schedule.ts'
export type { PriceEntry, TokenRates } from './core/pricing.ts'
export type {
  PricingSchedule,
  PricingScheduleSet,
  PricingWindow,
  ModelPricing,
  ResolvedPricing,
  DayCostEstimate,
} from './core/schedule.ts'
