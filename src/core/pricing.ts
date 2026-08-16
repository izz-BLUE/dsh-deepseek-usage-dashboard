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

import type { UsageBuckets } from './mapping.ts'
import { sumMicro, tokensCostMicro, type MicroAmount } from './money.ts'

/** One model's rates per million tokens (the cost math only needs these). */
export interface TokenRates {
  /** Price per million cache-HIT input tokens. */
  cacheHitInputPricePerMillion: number
  /** Price per million cache-MISS input tokens. */
  cacheMissInputPricePerMillion: number
  /** Price per million output tokens. */
  outputPricePerMillion: number
}

/** One model's price entry (per million tokens, in `currency` units). */
export interface PriceEntry extends TokenRates {
  /** Exact model id, or `*` for a user-configured fallback entry. */
  model: string
  /** ISO 4217 currency code the prices are quoted in. */
  currency: string
  /** ISO date (YYYY-MM-DD) this entry's prices took effect. */
  effectiveFrom: string
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
export const DEFAULT_PRICE_ENTRIES: PriceEntry[] = [
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
]

/**
 * Resolve the entry pricing one model: exact match, then the `*` fallback.
 * @deprecated Use `resolvePricing` from `schedule.ts` (time-aware). This
 * legacy lookup ignores `effectiveFrom` entirely.
 */
export function resolvePriceEntry(entries: readonly PriceEntry[], model: string): PriceEntry {
  const exact = entries.find(entry => entry.model === model)
  if (exact !== undefined) return exact
  const fallback = entries.find(entry => entry.model === '*')
  if (fallback !== undefined) return fallback
  throw new Error(`deepseek-usage: no price entry and no '*' fallback for model ${model}`)
}

/** The estimated micro-unit cost of one usage row under one rates object. */
export interface CostBreakdown {
  cacheHit: MicroAmount
  cacheMiss: MicroAmount
  output: MicroAmount
  /** cacheHit + cacheMiss + output. */
  total: MicroAmount
}

/** Estimate one usage row's cost in micro-units (integer arithmetic only). */
export function costOfBuckets(rates: TokenRates, buckets: UsageBuckets): CostBreakdown {
  const cacheHit = tokensCostMicro(buckets.cacheHitInputTokens, rates.cacheHitInputPricePerMillion)
  const cacheMiss = tokensCostMicro(buckets.cacheMissInputTokens, rates.cacheMissInputPricePerMillion)
  const output = tokensCostMicro(buckets.outputTokens, rates.outputPricePerMillion)
  return { cacheHit, cacheMiss, output, total: sumMicro([cacheHit, cacheMiss, output]) }
}

/** True when two price tables are structurally equal (change detection). */
export function priceEntriesEqual(a: readonly PriceEntry[], b: readonly PriceEntry[]): boolean {
  if (a.length !== b.length) return false
  return a.every((entry, index) => {
    const other = b[index]
    return entry.model === other.model
      && entry.cacheHitInputPricePerMillion === other.cacheHitInputPricePerMillion
      && entry.cacheMissInputPricePerMillion === other.cacheMissInputPricePerMillion
      && entry.outputPricePerMillion === other.outputPricePerMillion
      && entry.currency === other.currency
      && entry.effectiveFrom === other.effectiveFrom
  })
}

/**
 * The v0.1.0 built-in default table: five rows INCLUDING the built-in `*`
 * fallback (the pre-time-aware engine shipped a silent wildcard). This is the
 * exact table the old settings schema persisted as its default, so a stored
 * copy is indistinguishable from a customization by mere presence.
 *
 * {@link isLegacyBuiltinDefaultPrices} detects that case structurally: a
 * persisted copy of this table is an IMPLICIT default and must auto-transition
 * to the built-in DEFAULT_SCHEDULES (legacy + official 2026-08-17), while any
 * genuinely customized legacy `prices` keeps working as-is.
 */
export const OLD_BUILTIN_DEFAULT_PRICE_ENTRIES: PriceEntry[] = [
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
]

/**
 * Whether a persisted legacy `prices` config is EXACTLY the v0.1.0 built-in
 * default table (model-keyed, order-insensitive — array order is not a user
 * customization signal). True means "the user never touched the price table;
 * the settings system just persisted the schema default", so the upgrade must
 * NOT keep them on the old flat pricing forever.
 *
 * Any difference — a price, a model, a currency, an effectiveFrom, a row
 * count — makes it an explicit custom config.
 */
export function isLegacyBuiltinDefaultPrices(prices: readonly PriceEntry[]): boolean {
  return priceEntriesEqualNormalized(prices, OLD_BUILTIN_DEFAULT_PRICE_ENTRIES)
}

/** Structural equality over model-keyed maps (order-insensitive). */
function priceEntriesEqualNormalized(a: readonly PriceEntry[], b: readonly PriceEntry[]): boolean {
  if (a.length !== b.length) return false
  const keyOf = (entry: PriceEntry): string => JSON.stringify([
    entry.model,
    entry.cacheHitInputPricePerMillion,
    entry.cacheMissInputPricePerMillion,
    entry.outputPricePerMillion,
    entry.currency,
    entry.effectiveFrom,
  ])
  const mapOf = (list: readonly PriceEntry[]): Map<string, number> => {
    const map = new Map<string, number>()
    for (const entry of list) {
      const key = keyOf(entry)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }
  const aMap = mapOf(a)
  const bMap = mapOf(b)
  if (aMap.size !== bMap.size) return false
  for (const [key, count] of aMap) {
    if (bMap.get(key) !== count) return false
  }
  return true
}

/** Validate one configured price entry; throws with a specific message. */
export function assertValidPriceEntry(entry: PriceEntry, index: number): void {
  const where = `price entry ${index} (${entry.model})`
  if (entry.model.trim() === '') throw new Error(`deepseek-usage: ${where} has an empty model`)
  for (const [name, value] of [
    ['cacheHitInputPricePerMillion', entry.cacheHitInputPricePerMillion],
    ['cacheMissInputPricePerMillion', entry.cacheMissInputPricePerMillion],
    ['outputPricePerMillion', entry.outputPricePerMillion],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`deepseek-usage: ${where} ${name} must be a non-negative number`)
  }
  if (entry.currency.trim() === '') throw new Error(`deepseek-usage: ${where} has an empty currency`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.effectiveFrom)) {
    throw new Error(`deepseek-usage: ${where} effectiveFrom must be YYYY-MM-DD`)
  }
}
