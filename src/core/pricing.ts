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
