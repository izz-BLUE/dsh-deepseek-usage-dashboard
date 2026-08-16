/**
 * Per-model pricing: exact-match lookup, `*` fallback, per-model cost
 * estimation, change detection, and entry validation.
 */

import { describe, expect, it } from 'vitest'
import { assertValidPriceEntry, costOfBuckets, DEFAULT_PRICE_ENTRIES, priceEntriesEqual, resolvePriceEntry } from '../src/core/pricing.ts'
import { zeroBuckets } from '../src/core/mapping.ts'
import { DEEPSEEK_2026_08_17_SCHEDULE, prepareScheduleSet, resolvePricing } from '../src/core/schedule.ts'

describe('resolvePriceEntry', () => {
  it('prefers the exact model match over the fallback', () => {
    const entry = resolvePriceEntry(DEFAULT_PRICE_ENTRIES, 'deepseek-v4-flash')
    expect(entry.model).toBe('deepseek-v4-flash')
    expect(entry.cacheHitInputPricePerMillion).toBe(0.02)
  })

  it('the built-in default ships NO * fallback: unknown models throw instead of silently pricing', () => {
    // Phase 1 contract: without an explicit user wildcard, an unknown model
    // is UNPRICED — the legacy resolver surfaces that as an error rather
    // than a guessed Flash price (the time-aware resolver never throws).
    expect(() => resolvePriceEntry(DEFAULT_PRICE_ENTRIES, 'future-unknown-model')).toThrow(/no price entry/)
    expect(DEFAULT_PRICE_ENTRIES.some(entry => entry.model === '*')).toBe(false)
  })

  it('uses the pro table for deepseek-v4-pro', () => {
    const entry = resolvePriceEntry(DEFAULT_PRICE_ENTRIES, 'deepseek-v4-pro')
    expect(entry.cacheMissInputPricePerMillion).toBe(3)
    expect(entry.outputPricePerMillion).toBe(6)
  })

  it('an explicit user wildcard still falls back for unknown models', () => {
    const withWildcard = [...DEFAULT_PRICE_ENTRIES, { model: '*', cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-04-24' }]
    const entry = resolvePriceEntry(withWildcard, 'future-unknown-model')
    expect(entry.model).toBe('*')
  })

  it('throws when neither the model nor a fallback exists', () => {
    expect(() => resolvePriceEntry([], 'any-model')).toThrow()
    expect(() => resolvePriceEntry([{ model: 'a', cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 1, currency: 'CNY', effectiveFrom: '2025-01-01' }], 'b')).toThrow()
  })

  it('prices different models differently (no single global price)', () => {
    const buckets = { ...zeroBuckets(), cacheMissInputTokens: 1_000_000, outputTokens: 1_000_000 }
    const flash = costOfBuckets(resolvePriceEntry(DEFAULT_PRICE_ENTRIES, 'deepseek-v4-flash'), buckets)
    const pro = costOfBuckets(resolvePriceEntry(DEFAULT_PRICE_ENTRIES, 'deepseek-v4-pro'), buckets)
    expect(flash.total).toBe(3_000_000n) // ¥1 + ¥2 per million
    expect(pro.total).toBe(9_000_000n) // ¥3 + ¥6 per million
    expect(pro.total).not.toBe(flash.total)
  })
})

describe('costOfBuckets', () => {
  it('matches the official 2026-08-14 bill for the dashboard sample', () => {
    const entry = resolvePriceEntry(DEFAULT_PRICE_ENTRIES, 'deepseek-v4-flash')
    const cost = costOfBuckets(entry, {
      ...zeroBuckets(),
      cacheHitInputTokens: 33_337_728,
      cacheMissInputTokens: 193_004,
      outputTokens: 206_901,
    })
    // ¥0.02/M cache hit + ¥1/M cache miss + ¥2/M output = ¥1.27356056,
    // rounded to the plugin's integer micro-yuan precision.
    expect(cost.total).toBe(1_273_561n)
  })

  it('prices each bucket at its own rate', () => {
    const entry = resolvePriceEntry(DEFAULT_PRICE_ENTRIES, 'deepseek-v4-flash')
    const cost = costOfBuckets(entry, {
      ...zeroBuckets(),
      cacheHitInputTokens: 1_000_000,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    expect(cost.cacheHit).toBe(20_000n) // ¥0.02
    expect(cost.cacheMiss).toBe(1_000_000n) // ¥1
    expect(cost.output).toBe(2_000_000n) // ¥2
    expect(cost.total).toBe(3_020_000n) // ¥3.02
  })

  it('costs nothing for zero tokens', () => {
    const cost = costOfBuckets(resolvePriceEntry(DEFAULT_PRICE_ENTRIES, 'deepseek-v4-flash'), zeroBuckets())
    expect(cost.total).toBe(0n)
  })
})

describe('official billing reference fixture (2026-08-17 off-peak)', () => {
  it('prices the official DeepSeek day totals at the off-peak flash rates', () => {
    // The DeepSeek official backend day (cache hit 59,261,184 / cache miss
    // 1,033,483 / output 325,656) resolved against the 2026-08-17 schedule's
    // off-peak flash rates (0.05 / 1.50 / 4.50 CNY per million):
    //   59.261184 × 0.05 + 1.033483 × 1.50 + 0.325656 × 4.50 = ¥5.978736.
    const requestTimeMs = Date.parse('2026-08-17T02:00:00+08:00') // off-peak
    const resolved = resolvePricing(prepareScheduleSet([DEEPSEEK_2026_08_17_SCHEDULE]), 'deepseek-v4-flash', requestTimeMs)
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') throw new Error('expected priced')
    expect(resolved.bandId).toBe('off-peak')
    const cost = costOfBuckets(resolved.rates, {
      ...zeroBuckets(),
      cacheHitInputTokens: 59_261_184,
      cacheMissInputTokens: 1_033_483,
      outputTokens: 325_656,
    })
    expect(cost.cacheHit).toBe(2_963_059n) // ¥2.963059
    expect(cost.cacheMiss).toBe(1_550_225n) // ¥1.550225
    expect(cost.output).toBe(1_465_452n) // ¥1.465452
    expect(cost.total).toBe(5_978_736n) // ¥5.978736
  })
})

describe('priceEntriesEqual', () => {
  it('detects structural equality and changes', () => {
    expect(priceEntriesEqual(DEFAULT_PRICE_ENTRIES, DEFAULT_PRICE_ENTRIES)).toBe(true)
    const changed = DEFAULT_PRICE_ENTRIES.map(entry => ({ ...entry, cacheHitInputPricePerMillion: entry.cacheHitInputPricePerMillion + 0.1 }))
    expect(priceEntriesEqual(DEFAULT_PRICE_ENTRIES, changed)).toBe(false)
    expect(priceEntriesEqual(DEFAULT_PRICE_ENTRIES, DEFAULT_PRICE_ENTRIES.slice(1))).toBe(false)
  })
})

describe('assertValidPriceEntry', () => {
  const good = { model: 'm', cacheHitInputPricePerMillion: 0.5, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 8, currency: 'CNY', effectiveFrom: '2025-09-05' }
  it('accepts a valid entry', () => {
    expect(() => assertValidPriceEntry(good, 0)).not.toThrow()
  })
  it('rejects bad model, currency, date, and prices', () => {
    expect(() => assertValidPriceEntry({ ...good, model: ' ' }, 0)).toThrow(/empty model/)
    expect(() => assertValidPriceEntry({ ...good, currency: '' }, 0)).toThrow(/empty currency/)
    expect(() => assertValidPriceEntry({ ...good, effectiveFrom: '2025/09/05' }, 0)).toThrow(/effectiveFrom/)
    expect(() => assertValidPriceEntry({ ...good, outputPricePerMillion: -1 }, 0)).toThrow(/outputPricePerMillion/)
    expect(() => assertValidPriceEntry({ ...good, cacheMissInputPricePerMillion: Number.NaN }, 0)).toThrow(/cacheMissInputPricePerMillion/)
  })
})
