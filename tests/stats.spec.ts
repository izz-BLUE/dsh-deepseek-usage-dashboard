/**
 * Daily statistics aggregation: buckets, request counts, cache hit rate, and
 * the 7-day trend built over stored rows.
 */

import { describe, expect, it } from 'vitest'
import { aggregateDaily, emptyDailyStats, formatHitRate } from '../src/core/stats.ts'
import type { UsageRow } from '../src/core/sqlite-store.ts'
import { recentDayKeys } from '../src/core/day.ts'

/** One usage row. */
function row(partial: Partial<UsageRow> & { sessionId: string; turn: number; step: number }): UsageRow {
  return {
    seq: 1,
    time: 0,
    model: 'deepseek-chat',
    provider: 'deepseek-official',
    cacheHit: 0,
    cacheMiss: 0,
    output: 0,
    reasoning: 0,
    failed: false,
    ...partial,
  }
}

describe('aggregateDaily', () => {
  it('sums buckets and counts requests', () => {
    const stats = aggregateDaily('2026-01-02', [
      row({ sessionId: 's1', turn: 0, step: 0, cacheHit: 30, cacheMiss: 70, output: 20, reasoning: 5 }),
      row({ sessionId: 's1', turn: 0, step: 1, cacheHit: 0, cacheMiss: 10, output: 2 }),
      row({ sessionId: 's2', turn: 0, step: 0, failed: true }),
    ])
    expect(stats).toMatchObject({
      date: '2026-01-02',
      cacheHitInputTokens: 30,
      cacheMissInputTokens: 80,
      outputTokens: 22,
      reasoningTokens: 5,
      totalInputTokens: 110,
      totalTokens: 132,
      requestCount: 3,
      failedRequestCount: 1,
    })
  })

  it('computes the cache hit rate only over input', () => {
    expect(aggregateDaily('d', [
      row({ sessionId: 's1', turn: 0, step: 0, cacheHit: 25, cacheMiss: 75 }),
    ]).cacheHitRate).toBeCloseTo(0.25, 10)
    expect(aggregateDaily('d', [
      row({ sessionId: 's1', turn: 0, step: 0, cacheHit: 100, cacheMiss: 0 }),
    ]).cacheHitRate).toBe(1)
    expect(aggregateDaily('d', [
      row({ sessionId: 's1', turn: 0, step: 0, cacheHit: 0, cacheMiss: 100 }),
    ]).cacheHitRate).toBe(0)
  })

  it('reports null hit rate without any input tokens', () => {
    expect(aggregateDaily('d', [row({ sessionId: 's1', turn: 0, step: 0, failed: true })]).cacheHitRate).toBeNull()
    expect(emptyDailyStats('d').cacheHitRate).toBeNull()
    expect(emptyDailyStats('d').requestCount).toBe(0)
  })

  it('ignores failed rows in token buckets', () => {
    const stats = aggregateDaily('d', [row({ sessionId: 's1', turn: 0, step: 0, failed: true, output: 999 })])
    expect(stats.outputTokens).toBe(0)
    expect(stats.failedRequestCount).toBe(1)
  })
})

describe('trend keys', () => {
  it('produces the 7-day window ending today', () => {
    const keys = recentDayKeys('2026-01-09', 7)
    expect(keys).toEqual(['2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'])
  })
})

describe('formatHitRate', () => {
  it('renders percentages and the empty state', () => {
    expect(formatHitRate(0.421)).toBe('42.1%')
    expect(formatHitRate(1)).toBe('100.0%')
    expect(formatHitRate(null)).toBe('--')
  })
})
