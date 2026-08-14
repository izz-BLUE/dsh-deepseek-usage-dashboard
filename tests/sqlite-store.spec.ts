/**
 * SQLite store: idempotent inserts (UNIQUE constraint), restart recovery,
 * concurrent session writes, daily aggregation, meta, balance persistence,
 * and corruption recovery.
 */

import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UsageStore, type UsageRow } from '../src/core/sqlite-store.ts'

let dir: string
let store: UsageStore

/** One usage row for a session. */
function row(partial: Partial<UsageRow> & { sessionId: string; turn: number; step: number }): UsageRow {
  return {
    seq: 1,
    time: Date.UTC(2026, 0, 1, 8, 0, 0),
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-usage-store-'))
  store = new UsageStore(join(dir, 'usage.db'))
})

afterEach(() => {
  store.close()
})

describe('inserts and the UNIQUE constraint', () => {
  it('inserts rows and reads them back', () => {
    const outcome = store.insertRows([row({ sessionId: 's1', turn: 0, step: 0, cacheHit: 30, cacheMiss: 70, output: 20 })])
    expect(outcome).toEqual({ inserted: 1, ignored: 0 })
    expect(store.rowCount()).toBe(1)
    const rows = store.allRows()
    expect(rows[0]).toMatchObject({ sessionId: 's1', turn: 0, step: 0, cacheHit: 30, cacheMiss: 70, output: 20 })
  })

  it('ignores duplicate (sessionId, turn, step) — the idempotency backstop', () => {
    const base = row({ sessionId: 's1', turn: 0, step: 0, output: 20 })
    expect(store.insertRows([base]).inserted).toBe(1)
    // Duplicate streaming usage arrival: same key, different values.
    expect(store.insertRows([{ ...base, output: 999, seq: 7 }])).toEqual({ inserted: 0, ignored: 1 })
    expect(store.allRows()[0].output).toBe(20) // first write wins
    expect(store.hasRow('s1', 0, 0)).toBe(true)
    expect(store.hasRow('s1', 0, 1)).toBe(false)
  })

  it('treats the same step of DIFFERENT sessions as distinct rows', () => {
    store.insertRows([
      row({ sessionId: 's1', turn: 0, step: 0, output: 1 }),
      row({ sessionId: 's2', turn: 0, step: 0, output: 2 }),
    ])
    expect(store.rowCount()).toBe(2)
  })
})

describe('restart recovery', () => {
  it('retains rows across close + reopen (plugin restart)', () => {
    store.insertRows([row({ sessionId: 's1', turn: 0, step: 0, output: 20 })])
    store.close()
    store = new UsageStore(join(dir, 'usage.db'))
    expect(store.rowCount()).toBe(1)
    expect(store.allRows()[0].output).toBe(20)
    // Re-scanning the same events after restart inserts nothing new.
    expect(store.insertRows([row({ sessionId: 's1', turn: 0, step: 0, output: 20 })])).toEqual({ inserted: 0, ignored: 1 })
  })
})

describe('concurrent session writes', () => {
  it('serializes interleaved inserts from many sessions without loss', async () => {
    const batches = Array.from({ length: 20 }, (_, session) =>
      Array.from({ length: 10 }, (_, step) => row({ sessionId: `s${session}`, turn: 0, step, output: step })))
    // Fire all batches concurrently (the store serializes internally).
    await Promise.all(batches.map(rows => Promise.resolve().then(() => store.insertRows(rows))))
    expect(store.rowCount()).toBe(200)
  })
})

describe('daily aggregation', () => {
  it('aggregates one day and excludes other days', () => {
    const inDay = row({ sessionId: 's1', turn: 0, step: 0, time: Date.UTC(2026, 0, 2, 2, 0, 0), cacheHit: 30, cacheMiss: 70, output: 20, reasoning: 5 })
    const failed = row({ sessionId: 's1', turn: 1, step: 0, time: Date.UTC(2026, 0, 2, 3, 0, 0), failed: true })
    // 2026-01-03 01:00Z is still Shanghai 2026-01-03 09:00 (same day ok), but
    // this one is deliberately outside the 2026-01-02 Shanghai day:
    const otherDay = row({ sessionId: 's1', turn: 2, step: 0, time: Date.UTC(2026, 0, 3, 17, 0, 0), output: 999 })
    store.insertRows([inDay, failed, otherDay])
    const stats = store.dailyStats('2026-01-02')
    expect(stats.date).toBe('2026-01-02')
    expect(stats.cacheHitInputTokens).toBe(30)
    expect(stats.cacheMissInputTokens).toBe(70)
    expect(stats.outputTokens).toBe(20)
    expect(stats.reasoningTokens).toBe(5)
    expect(stats.totalInputTokens).toBe(100)
    expect(stats.totalTokens).toBe(120)
    expect(stats.requestCount).toBe(2)
    expect(stats.failedRequestCount).toBe(1)
    expect(stats.cacheHitRate).toBeCloseTo(0.3, 10)
  })
})

describe('meta and balance persistence', () => {
  it('round-trips meta values', () => {
    expect(store.metaGet('pricesVersion')).toBeUndefined()
    store.metaSet('pricesVersion', '2')
    expect(store.metaGet('pricesVersion')).toBe('2')
    store.metaSet('pricesVersion', '3')
    expect(store.metaGet('pricesVersion')).toBe('3')
  })

  it('round-trips the balance snapshot across reopen', () => {
    const snapshot = { isAvailable: true, infos: [{ currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.00', toppedUpBalance: '10.34' }] }
    store.saveBalance(snapshot, 1234567, 'ok')
    store.close()
    store = new UsageStore(join(dir, 'usage.db'))
    const stored = store.loadBalance()
    expect(stored?.snapshot).toEqual(snapshot)
    expect(stored?.fetchedAtMs).toBe(1234567)
  })
})

describe('corruption recovery', () => {
  it('moves a damaged database aside and starts fresh', () => {
    const dbPath = join(dir, 'usage.db')
    store.close()
    writeFileSync(dbPath, 'this is not a sqlite database at all')
    store = new UsageStore(dbPath)
    expect(store.rowCount()).toBe(0)
    store.insertRows([row({ sessionId: 's1', turn: 0, step: 0 })])
    expect(store.rowCount()).toBe(1)
    // The damaged file was preserved for forensics under a .corrupt- suffix.
    const aside = readdirSync(dir).find(name => name.startsWith('usage.db.corrupt-'))
    expect(aside).toBeDefined()
    expect(readFileSync(join(dir, aside!), 'utf8')).toContain('not a sqlite database')
  })
})
