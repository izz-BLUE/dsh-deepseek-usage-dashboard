/**
 * Asia/Shanghai day keying: boundaries, cross-day splits, and day ranges.
 * Shanghai is UTC+8 year-round, so the Shanghai day runs 16:00Z -> 16:00Z.
 */

import { describe, expect, it } from 'vitest'
import { DAY_TIMEZONE, dayKeyOf, dayRangeMs, nextDayKey, previousDayKey, recentDayKeys } from '../src/core/day.ts'

describe('dayKeyOf (Asia/Shanghai)', () => {
  it('keys a UTC midnight instant as the same Shanghai day', () => {
    expect(dayKeyOf(Date.UTC(2026, 0, 1))).toBe('2026-01-01')
  })

  it('rolls over at 16:00 UTC (midnight Shanghai)', () => {
    expect(dayKeyOf(Date.UTC(2026, 0, 1, 15, 59, 59))).toBe('2026-01-01')
    expect(dayKeyOf(Date.UTC(2026, 0, 1, 16, 0, 0))).toBe('2026-01-02')
  })

  it('handles year and month boundaries', () => {
    expect(dayKeyOf(Date.UTC(2025, 11, 31, 15, 59, 59))).toBe('2025-12-31')
    expect(dayKeyOf(Date.UTC(2025, 11, 31, 16, 0, 0))).toBe('2026-01-01')
    expect(dayKeyOf(Date.UTC(2026, 1, 27, 16, 0, 0))).toBe('2026-02-28')
  })

  it('is stable across repeated calls', () => {
    const instant = Date.UTC(2026, 5, 15, 8, 30, 0)
    expect(dayKeyOf(instant)).toBe(dayKeyOf(instant))
  })
})

describe('dayRangeMs', () => {
  it('spans 16:00Z to the next 16:00Z', () => {
    const { startMs, endMs } = dayRangeMs('2026-01-02')
    expect(startMs).toBe(Date.UTC(2026, 0, 1, 16, 0, 0))
    expect(endMs).toBe(Date.UTC(2026, 0, 2, 16, 0, 0))
    expect(endMs - startMs).toBe(86_400_000)
  })

  it('rejects malformed keys', () => {
    expect(() => dayRangeMs('2026-1-2')).toThrow()
    expect(() => dayRangeMs('hello')).toThrow()
  })
})

describe('neighbor keys', () => {
  it('walks across month and year boundaries', () => {
    expect(previousDayKey('2026-01-01')).toBe('2025-12-31')
    expect(nextDayKey('2025-12-31')).toBe('2026-01-01')
    expect(nextDayKey('2026-02-28')).toBe('2026-03-01')
  })

  it('lists the last N days ending at today, oldest first', () => {
    const keys = recentDayKeys('2026-01-03', 7)
    expect(keys).toHaveLength(7)
    expect(keys[0]).toBe('2025-12-28')
    expect(keys[6]).toBe('2026-01-03')
  })
})

describe('cross-day statistics split', () => {
  it('assigns rows on either side of 16:00Z to different days', () => {
    const before = Date.UTC(2026, 0, 2, 15, 59, 59) // Shanghai 2026-01-02 23:59:59
    const after = Date.UTC(2026, 0, 2, 16, 0, 0) // Shanghai 2026-01-03 00:00:00
    expect(dayKeyOf(before)).toBe('2026-01-02')
    expect(dayKeyOf(after)).toBe('2026-01-03')
    const first = dayRangeMs(dayKeyOf(before))
    const second = dayRangeMs(dayKeyOf(after))
    expect(before >= first.startMs && before < first.endMs).toBe(true)
    expect(after >= second.startMs && after < second.endMs).toBe(true)
  })
})

describe('timezone constant', () => {
  it('is Asia/Shanghai', () => {
    expect(DAY_TIMEZONE).toBe('Asia/Shanghai')
  })
})
