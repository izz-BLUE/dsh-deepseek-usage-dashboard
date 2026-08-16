/**
 * Time-aware pricing engine (Phase 1) + the official DeepSeek 2026-08-17
 * schedule (Phase 2).
 *
 * - Versioned schedules with an inclusive effectiveFrom instant
 * - Request-time-bound pricing (settlement time is irrelevant)
 * - Daily band windows: start inclusive / end exclusive, cross-midnight,
 *   all-day, implicit off-peak; several windows may share one band (bandId)
 * - Historical price protection: adding a later schedule never reprices old
 *   requests
 * - Unknown models → UNPRICED (never a silent fallback to a guessed rate);
 *   an explicit user `*` wildcard still works
 *
 * The `SCHEDULE_B` / `SCHEDULE_C` fixtures below are SYNTHETIC and TEST ONLY
 * (111/222/333 etc. — chosen to fail loudly on wrong selection). The official
 * `DEEPSEEK_2026_08_17_SCHEDULE` fixture carries the REAL DeepSeek rates as
 * published in the official pricing notice effective 2026-08-17 00:00
 * Beijing Time, and the boundary fixtures verify it exactly.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEDULES,
  DEEPSEEK_2026_08_17_SCHEDULE,
  LEGACY_SCHEDULE,
  aggregateDayCost,
  bandForMinute,
  buildSchedulesFromPriceEntries,
  isInsideWindow,
  normalizeEffectiveFrom,
  prepareScheduleSet,
  pricingSetsEqual,
  resolvePricing,
  validatePricingScheduleSet,
  type PricableRow,
  type PricingSchedule,
  type PricingScheduleSet,
} from '../src/core/schedule.ts'
import { DEFAULT_PRICE_ENTRIES, type PriceEntry } from '../src/core/pricing.ts'

/** +08:00 wall clock → epoch ms. */
function at(wall: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?$/.exec(wall)
  if (match === null) throw new Error(`bad wall time ${wall}`)
  const [, y, m, d, h, min, s, frac] = match
  const ms = frac === undefined ? 0 : Number(`0${frac}`) * 1000
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h) - 8, Number(min), Number(s), ms)
}

const T_0823 = at('2026-08-16 23:00:00') // before the boundary
const T_0816_235959500 = at('2026-08-16 23:59:59.500')
const T_0817_0000 = at('2026-08-17 00:00:00.000') // exactly the boundary
const T_0817_0100 = at('2026-08-17 01:00:00')
const T_1001 = at('2026-10-01 00:00:00')

/**
 * Schedule B — SYNTHETIC TEST-ONLY rates (111/222/333 CNY per million) that
 * obviously differ from the legacy table so wrong-schedule selection fails
 * loudly. NOT the real 2026-08-17 pricing.
 */
const SCHEDULE_B: PricingSchedule = {
  id: 'test-b-2026-08-17',
  effectiveFrom: '2026-08-17T00:00:00+08:00',
  timezone: 'Asia/Shanghai',
  currency: 'CNY',
  windows: [{ id: 'peak', start: '08:00', end: '18:00' }],
  models: [
    { model: 'deepseek-v4-flash', ratesByBand: { peak: { cacheHitInputPricePerMillion: 111, cacheMissInputPricePerMillion: 222, outputPricePerMillion: 333 }, 'off-peak': { cacheHitInputPricePerMillion: 11, cacheMissInputPricePerMillion: 22, outputPricePerMillion: 33 } } },
  ],
}

/** Schedule C — SYNTHETIC TEST ONLY, effective 2026-10-01. */
const SCHEDULE_C: PricingSchedule = {
  id: 'test-c-2026-10-01',
  effectiveFrom: '2026-10-01T00:00:00+08:00',
  timezone: 'Asia/Shanghai',
  currency: 'CNY',
  windows: [{ id: 'all-day', start: '00:00', end: '00:00' }],
  models: [
    { model: 'deepseek-v4-flash', ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 3 } } },
  ],
}

/** One pricable row (settlement time and request time both explicit). */
function row(partial: Partial<PricableRow> & { model: string }): PricableRow {
  return {
    failed: false,
    cacheHit: 0,
    cacheMiss: 0,
    output: 0,
    time: T_0817_0000,
    requestTime: T_0817_0000,
    ...partial,
  }
}

const PREPARED_AB = prepareScheduleSet([LEGACY_SCHEDULE, SCHEDULE_B])

describe('effectiveFrom boundary (inclusive)', () => {
  it('prices a request BEFORE the boundary under the old schedule', () => {
    const resolved = resolvePricing(PREPARED_AB, 'deepseek-v4-flash', T_0823)
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.scheduleId).toBe('legacy-2026-04-24')
    expect(resolved.rates.cacheMissInputPricePerMillion).toBe(1)
  })

  it('prices a request EXACTLY at the boundary under the new schedule', () => {
    const resolved = resolvePricing(PREPARED_AB, 'deepseek-v4-flash', T_0817_0000)
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.scheduleId).toBe('test-b-2026-08-17')
    // 00:00 falls outside the 08:00–18:00 peak window → implicit off-peak.
    expect(resolved.bandId).toBe('off-peak')
    expect(resolved.rates.cacheMissInputPricePerMillion).toBe(22)
  })

  it('prices the instant just before the boundary under the old schedule', () => {
    const resolved = resolvePricing(PREPARED_AB, 'deepseek-v4-flash', T_0816_235959500)
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.scheduleId).toBe('legacy-2026-04-24')
  })

  it('normalizes a legacy YYYY-MM-DD effectiveFrom to midnight +08:00', () => {
    expect(normalizeEffectiveFrom('2026-04-24', 'Asia/Shanghai')).toBe('2026-04-24T00:00:00+08:00')
    expect(normalizeEffectiveFrom('2026-08-17T00:00:00+08:00', 'Asia/Shanghai')).toBe('2026-08-17T00:00:00+08:00')
  })

  it('rejects an invalid effectiveFrom', () => {
    expect(() => normalizeEffectiveFrom('2026/08/17', 'Asia/Shanghai')).toThrow(/effectiveFrom/)
    expect(() => normalizeEffectiveFrom('not-a-date', 'Asia/Shanghai')).toThrow(/effectiveFrom/)
    expect(() => normalizeEffectiveFrom('2026-08-17T00:00:00', 'Asia/Shanghai')).toThrow(/effectiveFrom/) // no offset
  })
})

describe('historical price protection', () => {
  it('a later schedule never reprices earlier requests', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: T_0823, time: T_0823, cacheMiss: 1_000_000, output: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 12:00:00'), time: at('2026-08-17 12:00:00'), cacheMiss: 1_000_000, output: 1_000_000 }),
    ]
    const before = aggregateDayCost([LEGACY_SCHEDULE, SCHEDULE_B], rows)
    expect(before.scheduleIdsUsed.sort()).toEqual(['legacy-2026-04-24', 'test-b-2026-08-17'])
    expect(before.totalMicro).toBe((3_000_000n + 555_000_000n).toString()) // legacy 1+2 / B peak 222+333 per M

    // Adding schedule C must not touch the previously computed rows.
    const after = aggregateDayCost([LEGACY_SCHEDULE, SCHEDULE_B, SCHEDULE_C], rows)
    expect(after.totalMicro).toBe(before.totalMicro)
    expect(after.scheduleIdsUsed.sort()).toEqual(before.scheduleIdsUsed.sort())
  })

  it('keeps a request before ALL schedules unpriced (no-schedule)', () => {
    const resolved = resolvePricing(PREPARED_AB, 'deepseek-v4-flash', at('2020-01-01 00:00:00'))
    expect(resolved).toEqual({ status: 'unpriced', model: 'deepseek-v4-flash', reason: 'no-schedule' })
  })
})

describe('daily bands (synthetic windows)', () => {
  it('start inclusive / end exclusive', () => {
    const peak = SCHEDULE_B.windows[0]!
    expect(isInsideWindow(8 * 60, peak)).toBe(true) // 08:00:00 inside
    expect(isInsideWindow(17 * 60 + 59, peak)).toBe(true) // 17:59 inside
    expect(isInsideWindow(18 * 60, peak)).toBe(false) // 18:00:00 outside
    expect(isInsideWindow(7 * 60 + 59, peak)).toBe(false)
  })

  it('resolves the peak band during 08:00–18:00', () => {
    const resolved = resolvePricing(PREPARED_AB, 'deepseek-v4-flash', at('2026-08-17 12:00:00'))
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.bandId).toBe('peak')
    expect(resolved.rates.cacheHitInputPricePerMillion).toBe(111)
  })

  it('resolves the implicit off-peak band outside declared windows', () => {
    const resolved = resolvePricing(PREPARED_AB, 'deepseek-v4-flash', at('2026-08-17 18:00:00'))
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.bandId).toBe('off-peak')
    expect(resolved.rates.cacheHitInputPricePerMillion).toBe(11)
    expect(resolved.rates.cacheMissInputPricePerMillion).toBe(22)
    expect(resolved.rates.outputPricePerMillion).toBe(33)
  })

  it('handles a cross-midnight window (22:00 → 06:00)', () => {
    const schedule: PricingSchedule = {
      id: 'test-night',
      effectiveFrom: '2026-08-17T00:00:00+08:00',
      timezone: 'Asia/Shanghai',
      currency: 'CNY',
      windows: [{ id: 'night', start: '22:00', end: '06:00' }],
      models: [{ model: 'm', ratesByBand: { night: { cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 3 }, 'off-peak': { cacheHitInputPricePerMillion: 9, cacheMissInputPricePerMillion: 9, outputPricePerMillion: 9 } } }],
    }
    const prepared = prepareScheduleSet([schedule])
    const night1 = resolvePricing(prepared, 'm', at('2026-08-17 23:30:00'))
    const night2 = resolvePricing(prepared, 'm', at('2026-08-18 03:00:00'))
    const day = resolvePricing(prepared, 'm', at('2026-08-18 12:00:00'))
    expect(night1.status === 'priced' && night1.bandId).toBe('night')
    expect(night2.status === 'priced' && night2.bandId).toBe('night')
    expect(day.status === 'priced' && day.bandId).toBe('off-peak')
  })

  it('treats an all-day window as covering the full day', () => {
    expect(isInsideWindow(0, { id: 'all-day', start: '00:00', end: '00:00' })).toBe(true)
    expect(isInsideWindow(1439, { id: 'all-day', start: '00:00', end: '00:00' })).toBe(true)
    const resolved = resolvePricing(prepareScheduleSet([LEGACY_SCHEDULE]), 'deepseek-v4-flash', T_0817_0100)
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.bandId).toBe('all-day')
  })
})

describe('unknown models and wildcards', () => {
  it('unknown model → unpriced (no silent fallback)', () => {
    const resolved = resolvePricing(PREPARED_AB, 'mystery-model-9000', T_0817_0100)
    expect(resolved).toEqual({ status: 'unpriced', model: 'mystery-model-9000', reason: 'unknown-model' })
  })

  it('unknown band for a known model → unpriced (no-rates-for-band)', () => {
    const resolved = resolvePricing(PREPARED_AB, 'deepseek-v4-flash', T_0817_0000)
    expect(resolved.status).toBe('priced') // peak has rates at 00:00? no — 00:00 is off-peak
    if (resolved.status === 'priced') expect(resolved.bandId).toBe('off-peak')
    // SCHEDULE_B has no off-peak rates for a SECOND model: prove no-rates-for-band.
    const schedule = { ...SCHEDULE_B, models: [...SCHEDULE_B.models, { model: 'half-priced', ratesByBand: { peak: { cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 3 } } }] }
    const partial = resolvePricing(prepareScheduleSet([LEGACY_SCHEDULE, schedule]), 'half-priced', at('2026-08-17 20:00:00'))
    expect(partial).toEqual({ status: 'unpriced', model: 'half-priced', reason: 'no-rates-for-band' })
    const peakResolved = resolvePricing(prepareScheduleSet([LEGACY_SCHEDULE, schedule]), 'half-priced', at('2026-08-17 12:00:00'))
    expect(peakResolved.status).toBe('priced')
  })

  it('an explicit user * wildcard entry prices unknown models', () => {
    const wildcard: PricingSchedule = {
      id: 'test-wildcard',
      effectiveFrom: '2026-04-24T00:00:00+08:00',
      timezone: 'Asia/Shanghai',
      currency: 'CNY',
      windows: [{ id: 'all-day', start: '00:00', end: '00:00' }],
      models: [{ model: '*', ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } } }],
    }
    const resolved = resolvePricing(prepareScheduleSet([wildcard]), 'anything-new', T_0817_0100)
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.rates.cacheMissInputPricePerMillion).toBe(1)
  })

  it('an unknown model aggregates as unpriced without inventing a number', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 12:00:00'), cacheMiss: 1_000_000, output: 1_000_000 }),
      row({ model: 'mystery-model-9000', requestTime: at('2026-08-17 12:00:00'), cacheMiss: 500_000, output: 500_000 }),
    ]
    const estimate = aggregateDayCost([LEGACY_SCHEDULE, SCHEDULE_B], rows)
    expect(estimate.pricedRequestCount).toBe(1)
    expect(estimate.unpricedRequestCount).toBe(1)
    expect(estimate.unpriced).toEqual({ cacheHitInputTokens: 0, cacheMissInputTokens: 500_000, outputTokens: 500_000 })
    // The unpriced tokens are NOT in the total.
    expect(estimate.totalMicro).toBe((555_000_000n).toString())
    expect(estimate.total).toBe('555.000000')
  })
})

describe('validation', () => {
  const valid: PricingScheduleSet = { schedules: [LEGACY_SCHEDULE] }

  it('accepts a valid set', () => {
    expect(() => validatePricingScheduleSet(valid)).not.toThrow()
  })

  it('rejects an empty schedule list', () => {
    expect(() => validatePricingScheduleSet({ schedules: [] })).toThrow(/at least one schedule/)
  })

  it('rejects duplicate schedule ids and duplicate effectiveFrom instants', () => {
    expect(() => validatePricingScheduleSet({ schedules: [LEGACY_SCHEDULE, { ...LEGACY_SCHEDULE, id: 'legacy-2026-04-24' }] })).toThrow(/duplicate pricing schedule id/)
    expect(() => validatePricingScheduleSet({ schedules: [LEGACY_SCHEDULE, { ...LEGACY_SCHEDULE, id: 'legacy-dup' }] })).toThrow(/same effectiveFrom/)
  })

  it('rejects invalid effectiveFrom', () => {
    expect(() => validatePricingScheduleSet({ schedules: [{ ...LEGACY_SCHEDULE, effectiveFrom: '2026/04/24' }] })).toThrow(/effectiveFrom/)
  })

  it('rejects overlapping windows (all-day vs any window)', () => {
    const bad: PricingSchedule = {
      ...LEGACY_SCHEDULE,
      windows: [
        { id: 'all-day', start: '00:00', end: '00:00' },
        { id: 'peak', start: '08:00', end: '18:00' },
      ],
    }
    expect(() => validatePricingScheduleSet({ schedules: [bad] })).toThrow(/overlapping windows/)
  })

  it('rejects malformed window times and duplicate window ids', () => {
    const badTime: PricingSchedule = { ...LEGACY_SCHEDULE, windows: [{ id: 'w', start: '25:00', end: '18:00' }] }
    expect(() => validatePricingScheduleSet({ schedules: [badTime] })).toThrow(/out of range|HH:MM/)
    const badFormat: PricingSchedule = { ...LEGACY_SCHEDULE, windows: [{ id: 'w', start: '8am', end: '18:00' }] }
    expect(() => validatePricingScheduleSet({ schedules: [badFormat] })).toThrow(/HH:MM/)
    const dup: PricingSchedule = { ...LEGACY_SCHEDULE, windows: [{ id: 'w', start: '08:00', end: '12:00' }, { id: 'w', start: '13:00', end: '18:00' }] }
    expect(() => validatePricingScheduleSet({ schedules: [dup] })).toThrow(/duplicate window id/)
  })

  it('rejects a band reference to a window that does not exist', () => {
    const bad: PricingSchedule = {
      ...LEGACY_SCHEDULE,
      models: [{ model: 'm', ratesByBand: { phantom: { cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 3 } } }],
    }
    expect(() => validatePricingScheduleSet({ schedules: [bad] })).toThrow(/unknown band/)
  })

  it('rejects negative or non-finite rates', () => {
    const bad: PricingSchedule = {
      ...LEGACY_SCHEDULE,
      models: [{ model: 'm', ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: -1, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 3 } } }],
    }
    expect(() => validatePricingScheduleSet({ schedules: [bad] })).toThrow(/non-negative/)
  })

  it('rejects mixed currencies (one ¥ figure must never mix currencies)', () => {
    const usd: PricingSchedule = { ...SCHEDULE_B, id: 'test-usd', currency: 'USD' }
    expect(() => validatePricingScheduleSet({ schedules: [LEGACY_SCHEDULE, usd] })).toThrow(/mixed currencies/)
    expect(() => buildSchedulesFromPriceEntries([
      { model: 'a', cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 1, currency: 'CNY', effectiveFrom: '2026-04-24' },
      { model: 'b', cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 1, currency: 'USD', effectiveFrom: '2026-04-24' },
    ])).toThrow(/mixed currencies/)
  })

  it('rejects more than one * wildcard entry', () => {
    const bad: PricingSchedule = {
      ...LEGACY_SCHEDULE,
      models: [
        { model: '*', ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 1 } } },
        { model: '*', ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: 2, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 2 } } },
      ],
    }
    expect(() => validatePricingScheduleSet({ schedules: [bad] })).toThrow(/wildcard/)
  })
})

describe('legacy compatibility (PriceEntry[] → schedules)', () => {
  it('normalizes the default table into an all-day legacy schedule', () => {
    const schedules = buildSchedulesFromPriceEntries(DEFAULT_PRICE_ENTRIES)
    expect(schedules).toHaveLength(1)
    const schedule = schedules[0]!
    expect(schedule.id).toBe('user-legacy-2026-04-24')
    expect(schedule.effectiveFrom).toBe('2026-04-24T00:00:00+08:00')
    expect(schedule.windows).toEqual([{ id: 'all-day', start: '00:00', end: '00:00' }])
    expect(schedule.models.map(model => model.model)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'])
  })

  it('keeps user-configured entries (including an explicit * wildcard)', () => {
    const custom: PriceEntry[] = [
      { model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.5, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 8, currency: 'CNY', effectiveFrom: '2025-09-05' },
      { model: '*', cacheHitInputPricePerMillion: 0.1, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 1, currency: 'CNY', effectiveFrom: '2025-09-05' },
    ]
    const schedules = buildSchedulesFromPriceEntries(custom)
    const resolved = resolvePricing(prepareScheduleSet(schedules), 'brand-new-model', at('2026-01-01 12:00:00'))
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.rates.cacheMissInputPricePerMillion).toBe(1)
  })

  it('groups entries by their effectiveFrom date', () => {
    const custom: PriceEntry[] = [
      { model: 'a', cacheHitInputPricePerMillion: 1, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 1, currency: 'CNY', effectiveFrom: '2025-01-01' },
      { model: 'b', cacheHitInputPricePerMillion: 2, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 2, currency: 'CNY', effectiveFrom: '2026-08-17' },
    ]
    const schedules = buildSchedulesFromPriceEntries(custom)
    expect(schedules.map(schedule => schedule.id)).toEqual(['user-legacy-2025-01-01', 'user-legacy-2026-08-17'])
    const early = resolvePricing(prepareScheduleSet(schedules), 'a', at('2026-01-01 12:00:00'))
    const late = resolvePricing(prepareScheduleSet(schedules), 'b', at('2026-09-01 12:00:00'))
    expect(early.status === 'priced' && early.scheduleId).toBe('user-legacy-2025-01-01')
    expect(late.status === 'priced' && late.scheduleId).toBe('user-legacy-2026-08-17')
    // Model b was not configured before 2026-08-17: unpriced on 2026-01-01.
    const earlyB = resolvePricing(prepareScheduleSet(schedules), 'b', at('2026-01-01 12:00:00'))
    expect(earlyB.status).toBe('unpriced')
  })
})

describe('cost aggregation', () => {
  it('prices a day that spans old and new schedules (each row at its own request time)', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: T_0823, time: T_0823, cacheMiss: 1_000_000, output: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 12:00:00'), time: at('2026-08-17 12:00:00'), cacheMiss: 1_000_000, output: 1_000_000 }),
    ]
    const estimate = aggregateDayCost([LEGACY_SCHEDULE, SCHEDULE_B], rows)
    expect(estimate.totalMicro).toBe((3_000_000n + 555_000_000n).toString())
    expect(estimate.pricedRequestCount).toBe(2)
    expect(estimate.unpricedRequestCount).toBe(0)
    expect(estimate.currency).toBe('CNY')
  })

  it('prices one day with peak and off-peak rows at their own rates', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 12:00:00'), cacheMiss: 1_000_000, output: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 23:00:00'), cacheMiss: 1_000_000, output: 1_000_000 }),
    ]
    const estimate = aggregateDayCost([SCHEDULE_B], rows)
    expect(estimate.totalMicro).toBe((555_000_000n + 55_000_000n).toString()) // peak 222+333 / off-peak 22+33
  })

  it('keeps partial unpriced rows out of the total', () => {
    // SCHEDULE_B only prices deepseek-v4-flash, so on 2026-08-17 both
    // unknown-x and deepseek-v4-pro are unpriced.
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 12:00:00'), cacheMiss: 1_000_000 }),
      row({ model: 'unknown-x', requestTime: at('2026-08-17 12:00:00'), cacheMiss: 1_000_000 }),
      row({ model: 'deepseek-v4-pro', requestTime: at('2026-08-17 12:00:00'), cacheMiss: 1_000_000, output: 1_000_000 }),
    ]
    const estimate = aggregateDayCost([LEGACY_SCHEDULE, SCHEDULE_B], rows)
    expect(estimate.totalMicro).toBe('222000000') // B peak miss-only flash
    expect(estimate.pricedRequestCount).toBe(1)
    expect(estimate.unpricedRequestCount).toBe(2)
    expect(estimate.unpriced.cacheMissInputTokens).toBe(2_000_000)
    expect(estimate.unpriced.outputTokens).toBe(1_000_000)
  })

  it('ignores failed requests entirely (no cost, no unpriced count)', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: T_0817_0100, failed: true, cacheMiss: 999_999, output: 999_999 }),
      row({ model: 'mystery', requestTime: T_0817_0100, failed: true, cacheMiss: 1, output: 1 }),
    ]
    const estimate = aggregateDayCost([LEGACY_SCHEDULE, SCHEDULE_B], rows)
    expect(estimate.totalMicro).toBe('0')
    expect(estimate.pricedRequestCount).toBe(0)
    expect(estimate.unpricedRequestCount).toBe(0)
    expect(estimate.unpriced).toEqual({ cacheHitInputTokens: 0, cacheMissInputTokens: 0, outputTokens: 0 })
  })

  it('prices a request crossing midnight by its START time (23:59:59.5 → old schedule)', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: T_0816_235959500, time: T_0817_0000 + 3000, cacheMiss: 1_000_000, output: 1_000_000 }),
    ]
    const estimate = aggregateDayCost([LEGACY_SCHEDULE, SCHEDULE_B], rows)
    expect(estimate.totalMicro).toBe('3000000') // legacy ¥1 + ¥2 — NOT the new 222+333
    expect(estimate.scheduleIdsUsed).toEqual(['legacy-2026-04-24'])
  })

  it('micro-unit arithmetic stays exact across schedules', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: T_0823, cacheHit: 33_337_728, cacheMiss: 193_004, output: 206_901 }),
    ]
    const estimate = aggregateDayCost([LEGACY_SCHEDULE, SCHEDULE_B], rows)
    // Same numbers as the official-bill regression in pricing.spec.ts: ¥1.27356056.
    expect(estimate.totalMicro).toBe('1273561')
  })
})

describe('pricingSetsEqual', () => {
  it('detects schedule changes', () => {
    expect(pricingSetsEqual({ schedules: [LEGACY_SCHEDULE] }, { schedules: [LEGACY_SCHEDULE] })).toBe(true)
    expect(pricingSetsEqual({ schedules: [LEGACY_SCHEDULE] }, { schedules: [SCHEDULE_B] })).toBe(false)
    const renamed = { ...LEGACY_SCHEDULE, id: 'other' }
    expect(pricingSetsEqual({ schedules: [LEGACY_SCHEDULE] }, { schedules: [renamed] })).toBe(false)
    const cheaper = { ...LEGACY_SCHEDULE, models: [{ ...LEGACY_SCHEDULE.models[0]!, ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: 0.01, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } } }] }
    expect(pricingSetsEqual({ schedules: [LEGACY_SCHEDULE] }, { schedules: [cheaper] })).toBe(false)
  })

  it('is sensitive to window bandId changes', () => {
    const shared: PricingSchedule = { ...SCHEDULE_B, windows: [{ id: 'peak-morning', bandId: 'peak', start: '09:00', end: '12:00' }] }
    const asId: PricingSchedule = { ...SCHEDULE_B, windows: [{ id: 'peak-morning', start: '09:00', end: '12:00' }] }
    expect(pricingSetsEqual({ schedules: [shared] }, { schedules: [asId] })).toBe(false)
  })
})

describe('official DeepSeek 2026-08-17 schedule (Phase 2)', () => {
  const OFFICIAL = prepareScheduleSet(DEFAULT_SCHEDULES)

  const priced = (model: string, wall: string) => {
    const resolved = resolvePricing(OFFICIAL, model, at(wall))
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') throw new Error(`expected priced, got ${resolved.reason}`)
    return resolved
  }

  it('ships the two built-in schedules with the official shape', () => {
    expect(DEFAULT_SCHEDULES.map(schedule => schedule.id)).toEqual(['legacy-2026-04-24', 'deepseek-2026-08-17'])
    const official = DEEPSEEK_2026_08_17_SCHEDULE
    expect(official.effectiveFrom).toBe('2026-08-17T00:00:00+08:00')
    expect(official.timezone).toBe('Asia/Shanghai')
    expect(official.currency).toBe('CNY')
    expect(official.windows).toEqual([
      { id: 'peak-morning', bandId: 'peak', start: '09:00', end: '12:00' },
      { id: 'peak-afternoon', bandId: 'peak', start: '14:00', end: '18:00' },
    ])
    // Peak rates are written ONCE under the shared `peak` band — no duplicates.
    expect(official.models.map(model => model.model)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
    expect(Object.keys(official.models[0]!.ratesByBand).sort()).toEqual(['off-peak', 'peak'])
    expect(() => validatePricingScheduleSet({ schedules: DEFAULT_SCHEDULES })).not.toThrow()
  })

  it('official rates match the published numbers (per 1M tokens, CNY)', () => {
    const flash = DEEPSEEK_2026_08_17_SCHEDULE.models[0]!
    const pro = DEEPSEEK_2026_08_17_SCHEDULE.models[1]!
    expect(flash.ratesByBand['off-peak']).toEqual({ cacheHitInputPricePerMillion: 0.05, cacheMissInputPricePerMillion: 1.5, outputPricePerMillion: 4.5 })
    expect(flash.ratesByBand.peak).toEqual({ cacheHitInputPricePerMillion: 0.1, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 9 })
    expect(pro.ratesByBand['off-peak']).toEqual({ cacheHitInputPricePerMillion: 0.15, cacheMissInputPricePerMillion: 4.5, outputPricePerMillion: 13.5 })
    expect(pro.ratesByBand.peak).toEqual({ cacheHitInputPricePerMillion: 0.3, cacheMissInputPricePerMillion: 9, outputPricePerMillion: 27 })
  })

  it('A: 2026-08-16 23:59:59.999 +08 flash → legacy schedule', () => {
    const resolved = priced('deepseek-v4-flash', '2026-08-16 23:59:59.999')
    expect(resolved.scheduleId).toBe('legacy-2026-04-24')
    expect(resolved.rates.cacheMissInputPricePerMillion).toBe(1)
  })

  it('B: 2026-08-17 00:00:00.000 +08 flash → new schedule, off-peak', () => {
    const resolved = priced('deepseek-v4-flash', '2026-08-17 00:00:00.000')
    expect(resolved.scheduleId).toBe('deepseek-2026-08-17')
    expect(resolved.bandId).toBe('off-peak')
    expect(resolved.rates.cacheMissInputPricePerMillion).toBe(1.5)
  })

  it('C: morning peak boundary — 08:59:59.999 off-peak, 09:00:00.000 peak', () => {
    expect(priced('deepseek-v4-flash', '2026-08-17 08:59:59.999').bandId).toBe('off-peak')
    const peak = priced('deepseek-v4-flash', '2026-08-17 09:00:00.000')
    expect(peak.bandId).toBe('peak')
    expect(peak.rates.outputPricePerMillion).toBe(9)
  })

  it('D: 11:59:59.999 peak, 12:00:00.000 off-peak', () => {
    expect(priced('deepseek-v4-flash', '2026-08-17 11:59:59.999').bandId).toBe('peak')
    expect(priced('deepseek-v4-flash', '2026-08-17 12:00:00.000').bandId).toBe('off-peak')
  })

  it('E: afternoon peak boundary — 13:59:59.999 off-peak, 14:00:00.000 peak', () => {
    expect(priced('deepseek-v4-flash', '2026-08-17 13:59:59.999').bandId).toBe('off-peak')
    expect(priced('deepseek-v4-flash', '2026-08-17 14:00:00.000').bandId).toBe('peak')
  })

  it('F: 17:59:59.999 peak, 18:00:00.000 off-peak', () => {
    expect(priced('deepseek-v4-flash', '2026-08-17 17:59:59.999').bandId).toBe('peak')
    expect(priced('deepseek-v4-flash', '2026-08-17 18:00:00.000').bandId).toBe('off-peak')
  })

  it('both peak windows share ONE band ("peak")', () => {
    expect(bandForMinute(DEEPSEEK_2026_08_17_SCHEDULE, 9 * 60 + 30)).toEqual({ bandId: 'peak', window: DEEPSEEK_2026_08_17_SCHEDULE.windows[0] })
    expect(bandForMinute(DEEPSEEK_2026_08_17_SCHEDULE, 15 * 60)).toEqual({ bandId: 'peak', window: DEEPSEEK_2026_08_17_SCHEDULE.windows[1] })
    expect(bandForMinute(DEEPSEEK_2026_08_17_SCHEDULE, 8 * 60)).toEqual({ bandId: 'off-peak', window: null })
  })

  it('chat / reasoner: legacy prices before the boundary, UNPRICED after', () => {
    const legacyChat = priced('deepseek-chat', '2026-08-16 23:00:00')
    expect(legacyChat.scheduleId).toBe('legacy-2026-04-24')
    expect(legacyChat.rates.cacheMissInputPricePerMillion).toBe(1)
    expect(priced('deepseek-reasoner', '2026-08-16 23:00:00').scheduleId).toBe('legacy-2026-04-24')
    // No official 2026-08-17 rate exists for these models → unpriced, never a guess.
    expect(resolvePricing(OFFICIAL, 'deepseek-chat', at('2026-08-17 01:00:00'))).toEqual({ status: 'unpriced', model: 'deepseek-chat', reason: 'unknown-model' })
    expect(resolvePricing(OFFICIAL, 'deepseek-reasoner', at('2026-08-17 01:00:00'))).toEqual({ status: 'unpriced', model: 'deepseek-reasoner', reason: 'unknown-model' })
    expect(resolvePricing(OFFICIAL, 'mystery-future-model', at('2026-08-17 01:00:00'))).toEqual({ status: 'unpriced', model: 'mystery-future-model', reason: 'unknown-model' })
  })

  describe('hand-computed fixtures (1M tokens each, integer micro arithmetic)', () => {
    const oneM = (model: string, wall: string, buckets: Partial<Pick<PricableRow, 'cacheHit' | 'cacheMiss' | 'output'>>) =>
      row({ model, requestTime: at(wall), time: at(wall), ...buckets })

    it('FLASH OFF-PEAK: hit ¥0.05 / miss ¥1.50 / output ¥4.50; all three ¥6.05', () => {
      expect(aggregateDayCost(DEFAULT_SCHEDULES, [oneM('deepseek-v4-flash', '2026-08-17 03:00:00', { cacheHit: 1_000_000 })]).totalMicro).toBe('50000')
      expect(aggregateDayCost(DEFAULT_SCHEDULES, [oneM('deepseek-v4-flash', '2026-08-17 03:00:00', { cacheMiss: 1_000_000 })]).totalMicro).toBe('1500000')
      expect(aggregateDayCost(DEFAULT_SCHEDULES, [oneM('deepseek-v4-flash', '2026-08-17 03:00:00', { output: 1_000_000 })]).totalMicro).toBe('4500000')
      const all = aggregateDayCost(DEFAULT_SCHEDULES, [oneM('deepseek-v4-flash', '2026-08-17 03:00:00', { cacheHit: 1_000_000, cacheMiss: 1_000_000, output: 1_000_000 })])
      expect(all.totalMicro).toBe('6050000')
      expect(all.total).toBe('6.050000')
    })

    it('FLASH PEAK: hit ¥0.10 / miss ¥3.00 / output ¥9.00; all three ¥12.10', () => {
      const all = aggregateDayCost(DEFAULT_SCHEDULES, [oneM('deepseek-v4-flash', '2026-08-17 10:00:00', { cacheHit: 1_000_000, cacheMiss: 1_000_000, output: 1_000_000 })])
      expect(all.totalMicro).toBe('12100000')
      expect(all.total).toBe('12.100000')
    })

    it('PRO OFF-PEAK: hit ¥0.15 / miss ¥4.50 / output ¥13.50; all three ¥18.15', () => {
      const all = aggregateDayCost(DEFAULT_SCHEDULES, [oneM('deepseek-v4-pro', '2026-08-17 03:00:00', { cacheHit: 1_000_000, cacheMiss: 1_000_000, output: 1_000_000 })])
      expect(all.totalMicro).toBe('18150000')
      expect(all.total).toBe('18.150000')
    })

    it('PRO PEAK: hit ¥0.30 / miss ¥9.00 / output ¥27.00; all three ¥36.30', () => {
      const all = aggregateDayCost(DEFAULT_SCHEDULES, [oneM('deepseek-v4-pro', '2026-08-17 10:00:00', { cacheHit: 1_000_000, cacheMiss: 1_000_000, output: 1_000_000 })])
      expect(all.totalMicro).toBe('36300000')
      expect(all.total).toBe('36.300000')
    })
  })

  it('mixed-time single day: five 1M-output flash rows → ¥31.50 (never one rate × total tokens)', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 08:30:00'), time: at('2026-08-17 08:30:00'), output: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 10:00:00'), time: at('2026-08-17 10:00:00'), output: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 13:00:00'), time: at('2026-08-17 13:00:00'), output: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 16:00:00'), time: at('2026-08-17 16:00:00'), output: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 20:00:00'), time: at('2026-08-17 20:00:00'), output: 1_000_000 }),
    ]
    const estimate = aggregateDayCost(DEFAULT_SCHEDULES, rows)
    expect(estimate.totalMicro).toBe('31500000') // 4.5 + 9 + 4.5 + 9 + 4.5
    expect(estimate.total).toBe('31.500000')
    expect(estimate.pricedRequestCount).toBe(5)
    expect(estimate.unpricedRequestCount).toBe(0)
    expect(estimate.scheduleIdsUsed).toEqual(['deepseek-2026-08-17'])
    // Sanity: 5M output × a single rate would NOT be ¥31.50 — per-row matters.
    expect(aggregateDayCost(DEFAULT_SCHEDULES, [row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 10:00:00'), output: 5_000_000 })]).totalMicro).toBe('45000000')
  })

  it('flash + pro mixed in one peak window → ¥36.00', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 10:00:00'), output: 1_000_000 }),
      row({ model: 'deepseek-v4-pro', requestTime: at('2026-08-17 10:00:00'), output: 1_000_000 }),
    ]
    const estimate = aggregateDayCost(DEFAULT_SCHEDULES, rows)
    expect(estimate.totalMicro).toBe('36000000') // 9 + 27
    expect(estimate.total).toBe('36.000000')
    expect(estimate.pricedRequestCount).toBe(2)
  })

  it('cross-midnight: request started 8/16 is priced under LEGACY even when it settles on 8/17', () => {
    const startedBefore = row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-16 23:59:59.500'), time: at('2026-08-17 00:00:03'), cacheMiss: 1_000_000 })
    const estimate = aggregateDayCost(DEFAULT_SCHEDULES, [startedBefore])
    expect(estimate.totalMicro).toBe('1000000') // legacy ¥1 — NOT the new ¥1.50
    expect(estimate.scheduleIdsUsed).toEqual(['legacy-2026-04-24'])
    const startedAfter = row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 00:00:00.000'), time: at('2026-08-17 00:00:03'), cacheMiss: 1_000_000 })
    const after = aggregateDayCost(DEFAULT_SCHEDULES, [startedAfter])
    expect(after.totalMicro).toBe('1500000') // new off-peak ¥1.50
    expect(after.scheduleIdsUsed).toEqual(['deepseek-2026-08-17'])
  })

  it('legacy history keeps its price forever once the 8/17 schedule exists (delta = 0)', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-16 12:00:00'), cacheHit: 33_337_728, cacheMiss: 193_004, output: 206_901 }),
      row({ model: 'deepseek-v4-pro', requestTime: at('2026-08-15 09:30:00'), cacheMiss: 10_000, output: 5_000 }),
      row({ model: 'deepseek-chat', requestTime: at('2026-08-14 18:00:00'), cacheMiss: 2_000_000 }),
    ]
    const onlyLegacy = aggregateDayCost([LEGACY_SCHEDULE], rows)
    const withOfficial = aggregateDayCost(DEFAULT_SCHEDULES, rows)
    expect(withOfficial.totalMicro).toBe(onlyLegacy.totalMicro)
    expect(withOfficial.total).toBe(onlyLegacy.total)
    expect(withOfficial.scheduleIdsUsed).toEqual(['legacy-2026-04-24'])
  })
})
