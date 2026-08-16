/**
 * v0.1.0 → v0.2.0 upgrade-compatibility gate (Release Gate P0).
 *
 * The old settings schema PERSISTED its built-in default `prices` array into
 * the settings document, so "prices is present" alone must NOT be treated as
 * a user customization. This spec pins the decision table:
 *
 *   - persisted copy of the v0.1.0 built-in table (incl. the old `*` row) →
 *     IMPLICIT default → DEFAULT_SCHEDULES (8/16 legacy, 8/17 official)
 *   - anything genuinely modified → explicit custom legacy pricing
 *   - order of rows is NOT a customization signal (model-keyed compare)
 *   - no prices at all → DEFAULT_SCHEDULES
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEDULES,
  LEGACY_SCHEDULE,
  DEEPSEEK_2026_08_17_SCHEDULE,
  prepareScheduleSet,
  resolvePricing,
} from '../src/core/schedule.ts'
import {
  OLD_BUILTIN_DEFAULT_PRICE_ENTRIES,
  isLegacyBuiltinDefaultPrices,
  type PriceEntry,
} from '../src/core/pricing.ts'
import { resolvePricingSet } from '../src/index.ts'

/** +08:00 wall clock → epoch ms. */
function at(wall: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?$/.exec(wall)
  if (match === null) throw new Error(`bad wall time ${wall}`)
  const [, y, m, d, h, min, s, frac] = match
  const ms = frac === undefined ? 0 : Number(`0${frac}`) * 1000
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h) - 8, Number(min), Number(s), ms)
}

/** One legacy price row (0.1.0 shape). */
function entry(partial: Partial<PriceEntry> & { model: string }): PriceEntry {
  return {
    cacheHitInputPricePerMillion: 0.02,
    cacheMissInputPricePerMillion: 1,
    outputPricePerMillion: 2,
    currency: 'CNY',
    effectiveFrom: '2026-04-24',
    ...partial,
  }
}

/** A modified copy of the built-in table (one field changed). */
function modified(change: (rows: PriceEntry[]) => void): PriceEntry[] {
  const rows = structuredClone(OLD_BUILTIN_DEFAULT_PRICE_ENTRIES)
  change(rows)
  return rows
}

describe('isLegacyBuiltinDefaultPrices (structural, order-insensitive)', () => {
  it('recognizes the exact v0.1.0 persisted default (including the old `*` row)', () => {
    expect(isLegacyBuiltinDefaultPrices(OLD_BUILTIN_DEFAULT_PRICE_ENTRIES)).toBe(true)
  })

  it('is order-insensitive: a reordered builtin table is still the builtin default', () => {
    const reordered = [...OLD_BUILTIN_DEFAULT_PRICE_ENTRIES].reverse()
    expect(isLegacyBuiltinDefaultPrices(reordered)).toBe(true)
    // Different ORDER of the same rows is not a customization signal.
    const shuffled = [OLD_BUILTIN_DEFAULT_PRICE_ENTRIES[4]!, OLD_BUILTIN_DEFAULT_PRICE_ENTRIES[0]!, OLD_BUILTIN_DEFAULT_PRICE_ENTRIES[2]!, OLD_BUILTIN_DEFAULT_PRICE_ENTRIES[1]!, OLD_BUILTIN_DEFAULT_PRICE_ENTRIES[3]!]
    expect(isLegacyBuiltinDefaultPrices(shuffled)).toBe(true)
  })

  it('rejects a single modified price (one-field change → custom)', () => {
    expect(isLegacyBuiltinDefaultPrices(modified(rows => { rows[0]!.outputPricePerMillion = 1.8 }))).toBe(false)
    expect(isLegacyBuiltinDefaultPrices(modified(rows => { rows[4]!.cacheMissInputPricePerMillion = 1.5 }))).toBe(false)
  })

  it('rejects a changed model, currency, effectiveFrom, or row count', () => {
    expect(isLegacyBuiltinDefaultPrices(modified(rows => { rows[2]!.model = 'deepseek-chat-2' }))).toBe(false)
    expect(isLegacyBuiltinDefaultPrices(modified(rows => { rows[1]!.currency = 'USD' }))).toBe(false)
    expect(isLegacyBuiltinDefaultPrices(modified(rows => { rows[0]!.effectiveFrom = '2026-05-01' }))).toBe(false)
    expect(isLegacyBuiltinDefaultPrices(OLD_BUILTIN_DEFAULT_PRICE_ENTRIES.slice(0, 4))).toBe(false) // dropped the `*` row
    expect(isLegacyBuiltinDefaultPrices([...OLD_BUILTIN_DEFAULT_PRICE_ENTRIES, entry({ model: 'extra-model' })])).toBe(false)
  })

  it('rejects a missing or empty config', () => {
    expect(isLegacyBuiltinDefaultPrices([])).toBe(false)
  })
})

describe('resolvePricingSet upgrade decision table', () => {
  it('persisted builtin default prices → DEFAULT_SCHEDULES, time-aware mode', () => {
    const resolved = resolvePricingSet({ prices: structuredClone(OLD_BUILTIN_DEFAULT_PRICE_ENTRIES) })
    expect(resolved.mode).toBe('time-aware')
    expect(resolved.schedules.map(schedule => schedule.id)).toEqual(['legacy-2026-04-24', 'deepseek-2026-08-17'])
  })

  it('no prices at all → DEFAULT_SCHEDULES, time-aware mode', () => {
    const resolved = resolvePricingSet({})
    expect(resolved.mode).toBe('time-aware')
    expect(resolved.schedules).toEqual(DEFAULT_SCHEDULES)
  })

  it('empty prices array → DEFAULT_SCHEDULES, time-aware mode', () => {
    const resolved = resolvePricingSet({ prices: [] })
    expect(resolved.mode).toBe('time-aware')
    expect(resolved.schedules).toEqual(DEFAULT_SCHEDULES)
  })

  it('custom legacy prices → preserved, legacy mode (never silently overridden)', () => {
    const custom: PriceEntry[] = [
      { model: 'deepseek-v4-flash', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 1.8, currency: 'CNY', effectiveFrom: '2026-04-24' },
      { model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.1, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2025-09-05' },
    ]
    const resolved = resolvePricingSet({ prices: custom })
    expect(resolved.mode).toBe('legacy')
    expect(resolved.schedules).toHaveLength(2) // grouped by effectiveFrom
    expect(resolved.schedules.map(schedule => schedule.id)).toEqual(['user-legacy-2025-09-05', 'user-legacy-2026-04-24'])
  })

  it('explicit pricingSchedules always win', () => {
    const resolved = resolvePricingSet({
      pricingSchedules: [{ ...LEGACY_SCHEDULE, id: 'mine' }],
      prices: structuredClone(OLD_BUILTIN_DEFAULT_PRICE_ENTRIES),
    })
    expect(resolved.mode).toBe('time-aware')
    expect(resolved.schedules[0]!.id).toBe('mine')
  })
})

describe('upgrade fixture: old persisted default flows into the official schedule', () => {
  const prepared = prepareScheduleSet(DEFAULT_SCHEDULES)

  it('2026-08-16 flash → legacy; 2026-08-17 00:01 → official off-peak; 10:00 → official peak', () => {
    const before = resolvePricing(prepared, 'deepseek-v4-flash', at('2026-08-16 23:00:00'))
    expect(before.status === 'priced' && before.scheduleId).toBe('legacy-2026-04-24')
    const offPeak = resolvePricing(prepared, 'deepseek-v4-flash', at('2026-08-17 00:01:00'))
    expect(offPeak.status).toBe('priced')
    if (offPeak.status !== 'priced') return
    expect(offPeak.scheduleId).toBe(DEEPSEEK_2026_08_17_SCHEDULE.id)
    expect(offPeak.bandId).toBe('off-peak')
    const peak = resolvePricing(prepared, 'deepseek-v4-flash', at('2026-08-17 10:00:00'))
    expect(peak.status).toBe('priced')
    if (peak.status !== 'priced') return
    expect(peak.scheduleId).toBe(DEEPSEEK_2026_08_17_SCHEDULE.id)
    expect(peak.bandId).toBe('peak')
    expect(peak.rates.outputPricePerMillion).toBe(9)
  })

  it('the old persisted default does NOT leak its `*` wildcard into the new engine', () => {
    // The 0.1.0 table carries a `*` row, but the implicit-default transition
    // must use the built-in schedules which deliberately have NO wildcard.
    const resolved = resolvePricing(prepared, 'brand-new-model', at('2026-08-17 10:00:00'))
    expect(resolved).toEqual({ status: 'unpriced', model: 'brand-new-model', reason: 'unknown-model' })
  })
})
