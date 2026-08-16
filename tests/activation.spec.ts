/**
 * 2026-08-17 pricing ACTIVATION gate (this round's P0).
 *
 * The DEFAULT configuration must now price a real request at
 * `2026-08-17 00:12 Asia/Shanghai` under `deepseek-2026-08-17` / off-peak
 * (0.05 / 1.50 / 4.50). The real dashboard screenshot fixture
 * (8,263,680 / 99,113 / 55,786) must produce the new off-peak total — and
 * NEVER the old flat-price screenshot total (¥0.375960). The band split
 * (peak/off-peak) and the current-band metadata at the 08:59/09:00/12:00/
 * 14:00/18:00 boundaries are pinned here too.
 *
 * Note on the hand-computed ¥0.8128905: the engine prices per row in
 * INTEGER micro-units (half-up), so 99,113 × ¥1.50/1M = 148,669.5 µ rounds
 * to 148,670 µ and the total is 812,891 µ → ¥0.812891. The half-micro
 * difference is the documented rounding, not an error.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEDULES,
  DEEPSEEK_2026_08_17_SCHEDULE,
  LEGACY_SCHEDULE,
  aggregateDayCost,
  emptyDayCostEstimate,
  prepareScheduleSet,
  resolvePricing,
  type PricableRow,
} from '../src/core/schedule.ts'
import { currentBandOf } from '../src/index.ts'

/** +08:00 wall clock → epoch ms. */
function at(wall: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?$/.exec(wall)
  if (match === null) throw new Error(`bad wall time ${wall}`)
  const [, y, m, d, h, min, s, frac] = match
  const ms = frac === undefined ? 0 : Number(`0${frac}`) * 1000
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h) - 8, Number(min), Number(s), ms)
}

/** One pricable row (request and settlement time both explicit). */
function row(partial: Partial<PricableRow> & { model: string }): PricableRow {
  return {
    failed: false,
    cacheHit: 0,
    cacheMiss: 0,
    output: 0,
    time: at('2026-08-17 00:12:00'),
    requestTime: at('2026-08-17 00:12:00'),
    ...partial,
  }
}

const PREPARED = prepareScheduleSet(DEFAULT_SCHEDULES)

/** The exact token buckets from the real dashboard screenshot. */
const SCREENSHOT_FIXTURE = {
  model: 'deepseek-v4-flash',
  requestTime: at('2026-08-17 00:12:00'),
  cacheHit: 8_263_680,
  cacheMiss: 99_113,
  output: 55_786,
}

describe('default runtime pricing (2026-08-17 activation)', () => {
  it('resolves a real 00:12 request → deepseek-2026-08-17 / off-peak / 0.05-1.50-4.50', () => {
    const resolved = resolvePricing(PREPARED, 'deepseek-v4-flash', at('2026-08-17 00:12:00'))
    expect(resolved.status).toBe('priced')
    if (resolved.status !== 'priced') return
    expect(resolved.scheduleId).toBe(DEEPSEEK_2026_08_17_SCHEDULE.id)
    expect(resolved.bandId).toBe('off-peak')
    expect(resolved.rates).toEqual({
      cacheHitInputPricePerMillion: 0.05,
      cacheMissInputPricePerMillion: 1.5,
      outputPricePerMillion: 4.5,
    })
  })

  it('screenshot fixture → ¥0.812891, NOT the old screenshot ¥0.375960', () => {
    const estimate = aggregateDayCost(DEFAULT_SCHEDULES, [row(SCREENSHOT_FIXTURE)])
    // Hand: 0.413184 + 0.1486695 + 0.251037 = 0.8128905; per-row half-up
    // micro rounding makes the engine total 812,891 µ.
    expect(estimate.totalMicro).toBe('812891')
    expect(estimate.total).toBe('0.812891')
    // The SAME fixture under the legacy table reproduces the old screenshot
    // number — the activation must replace it, never reproduce it.
    const legacy = aggregateDayCost([LEGACY_SCHEDULE], [row(SCREENSHOT_FIXTURE)])
    expect(legacy.totalMicro).toBe('375959')
    expect(legacy.total).toBe('0.375959')
    expect(estimate.totalMicro).not.toBe(legacy.totalMicro)
    expect(estimate.totalMicro).not.toBe('375960')
  })

  it('band breakdown: off-peak only for a pure off-peak day (tokens ride along)', () => {
    const estimate = aggregateDayCost(DEFAULT_SCHEDULES, [row(SCREENSHOT_FIXTURE)])
    expect(estimate.bandCosts).toEqual([
      {
        bandId: 'off-peak',
        totalMicro: '812891',
        requestCount: 1,
        cacheHitInputTokens: 8_263_680,
        cacheMissInputTokens: 99_113,
        outputTokens: 55_786,
      },
    ])
    // Sum invariant: the split adds up to the total exactly.
    const sum = estimate.bandCosts.reduce((total, share) => total + BigInt(share.totalMicro), 0n)
    expect(sum.toString()).toBe(estimate.totalMicro)
    expect(emptyDayCostEstimate().bandCosts).toEqual([])
  })

  it('mixed peak/off-peak day splits bandCosts by each row\'s own band', () => {
    const rows = [
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 00:30:00'), cacheMiss: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 10:00:00'), cacheMiss: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 15:00:00'), output: 1_000_000 }),
      row({ model: 'deepseek-v4-flash', requestTime: at('2026-08-17 23:00:00'), output: 1_000_000 }),
    ]
    const estimate = aggregateDayCost(DEFAULT_SCHEDULES, rows)
    // off-peak: miss ¥1.50 + output ¥4.50 = ¥6.00; peak: miss ¥3 + output ¥9 = ¥12.00.
    expect(estimate.bandCosts).toEqual([
      { bandId: 'off-peak', totalMicro: '6000000', requestCount: 2, cacheHitInputTokens: 0, cacheMissInputTokens: 1_000_000, outputTokens: 1_000_000 },
      { bandId: 'peak', totalMicro: '12000000', requestCount: 2, cacheHitInputTokens: 0, cacheMissInputTokens: 1_000_000, outputTokens: 1_000_000 },
    ])
    expect(estimate.totalMicro).toBe('18000000')
    expect(estimate.total).toBe('18.000000')
    expect(estimate.scheduleIdsUsed).toEqual(['deepseek-2026-08-17'])
  })
})

describe('currentBandOf — the live band the UI badge shows', () => {
  const set = { schedules: DEFAULT_SCHEDULES }

  it('08:59 → off-peak; 09:00 → peak (morning window)', () => {
    expect(currentBandOf(set, at('2026-08-17 08:59:00'))).toMatchObject({
      scheduleId: 'deepseek-2026-08-17',
      bandId: 'off-peak',
      windowId: null,
      window: { id: null, start: '00:00', end: '09:00' },
    })
    expect(currentBandOf(set, at('2026-08-17 09:00:00'))).toMatchObject({
      scheduleId: 'deepseek-2026-08-17',
      bandId: 'peak',
      windowId: 'peak-morning',
      window: { id: 'peak-morning', start: '09:00', end: '12:00' },
      timezone: 'Asia/Shanghai',
    })
  })

  it('12:00 → off-peak; 14:00 → peak (afternoon window)', () => {
    expect(currentBandOf(set, at('2026-08-17 12:00:00'))).toMatchObject({
      bandId: 'off-peak',
      window: { id: null, start: '12:00', end: '14:00' },
    })
    expect(currentBandOf(set, at('2026-08-17 14:00:00'))).toMatchObject({
      bandId: 'peak',
      windowId: 'peak-afternoon',
      window: { id: 'peak-afternoon', start: '14:00', end: '18:00' },
    })
  })

  it('18:00 → off-peak', () => {
    expect(currentBandOf(set, at('2026-08-17 18:00:00'))).toMatchObject({
      bandId: 'off-peak',
      window: { id: null, start: '18:00', end: '24:00' },
    })
  })

  it('before the 8/17 boundary → the legacy schedule (all-day band)', () => {
    expect(currentBandOf(set, at('2026-08-16 12:00:00'))).toMatchObject({
      scheduleId: 'legacy-2026-04-24',
      bandId: 'all-day',
      windowId: 'all-day',
      window: { id: 'all-day', start: '00:00', end: '00:00' },
    })
  })

  it('before every schedule → null (no badge)', () => {
    expect(currentBandOf(set, at('2020-01-01 00:00:00'))).toBeNull()
  })
})
