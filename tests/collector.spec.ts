/**
 * Collector: fold-and-insert idempotency, restart recovery, endpoint
 * filtering (provider + base-URL host), and multi-session capture.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { foldAndInsert } from '../src/host/collector.ts'
import { UsageStore } from '../src/core/sqlite-store.ts'
import type { DeepseekEndpointFacts } from '../src/host/endpoint.ts'

let dir: string
let store: UsageStore

/** Endpoint facts matching the official route at api.deepseek.com. */
const MATCHING: DeepseekEndpointFacts = {
  providerId: 'deepseek-official',
  baseUrl: 'https://api.deepseek.com',
  matches: true,
}

/** Endpoint facts for a custom gateway (must NOT be counted). */
const NON_MATCHING: DeepseekEndpointFacts = {
  providerId: 'deepseek-official',
  baseUrl: 'https://gateway.internal.example',
  matches: false,
}

/** Endpoint facts for a different provider route. */
const OTHER_PROVIDER: DeepseekEndpointFacts = {
  providerId: 'deepseek-official',
  baseUrl: 'https://api.deepseek.com',
  matches: true,
}

function ev(type: string, data: unknown, seq: number, time: number): SessionEvent {
  return { type, data, seq, time } as SessionEvent
}

const USAGE: TokenUsage = { inputTokens: 70, outputTokens: 20, cacheReadTokens: 30, reasoningTokens: 5 }

/** The canonical DeepSeek conversation events for one settled step. */
function deepseekTurnEvents(provider: string, model: string, baseSeq: number, baseTime: number): SessionEvent[] {
  return [
    ev('request/header', { reason: 'initial', header: { config: { provider, model } } }, baseSeq, baseTime),
    ev('step/start', { turn: 0, step: 0 }, baseSeq + 1, baseTime + 100),
    ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'text-delta', index: 0, text: 'hi' } }, baseSeq + 2, baseTime + 200),
    ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: USAGE } }, baseSeq + 3, baseTime + 300),
    ev('assistant/message', { turn: 0, step: 0, message: { role: 'assistant', content: [] }, usage: USAGE }, baseSeq + 4, baseTime + 400),
    ev('step/end', { turn: 0, step: 0 }, baseSeq + 5, baseTime + 500),
    ev('turn/end', { turn: 0, reason: { kind: 'completed' } }, baseSeq + 6, baseTime + 600),
  ]
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-usage-collector-'))
  store = new UsageStore(join(dir, 'usage.db'))
})

afterEach(() => {
  store.close()
})

describe('foldAndInsert', () => {
  it('records a matching DeepSeek step once', () => {
    const events = deepseekTurnEvents('deepseek-official', 'deepseek-chat', 0, Date.UTC(2026, 0, 2, 2, 0, 0))
    const inserted = foldAndInsert(events, 's1', store, MATCHING)
    expect(inserted).toBe(1)
    const rows = store.allRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sessionId: 's1', turn: 0, step: 0, cacheHit: 30, cacheMiss: 70, output: 20, reasoning: 5, model: 'deepseek-chat' })
  })

  it('is idempotent across repeated scans (projection replay)', () => {
    const events = deepseekTurnEvents('deepseek-official', 'deepseek-chat', 0, Date.UTC(2026, 0, 2, 2, 0, 0))
    expect(foldAndInsert(events, 's1', store, MATCHING)).toBe(1)
    // Re-scan of the same log: nothing new (UNIQUE backstop).
    expect(foldAndInsert(events, 's1', store, MATCHING)).toBe(0)
    expect(store.rowCount()).toBe(1)
  })

  it('survives a plugin restart: a fresh store instance re-scan inserts nothing', () => {
    const events = deepseekTurnEvents('deepseek-official', 'deepseek-chat', 0, Date.UTC(2026, 0, 2, 2, 0, 0))
    foldAndInsert(events, 's1', store, MATCHING)
    store.close()
    store = new UsageStore(join(dir, 'usage.db'))
    expect(foldAndInsert(events, 's1', store, MATCHING)).toBe(0)
    expect(store.rowCount()).toBe(1)
  })

  it('records the duplicate streaming usage only once', () => {
    const events = [
      ...deepseekTurnEvents('deepseek-official', 'deepseek-chat', 0, Date.UTC(2026, 0, 2, 2, 0, 0)),
      // A duplicate usage chunk arriving again (same step) — ignored.
      ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: { ...USAGE, outputTokens: 999 } } }, 7, 700),
    ]
    foldAndInsert(events, 's1', store, MATCHING)
    expect(store.allRows()[0].output).toBe(20)
  })
})

describe('endpoint filtering', () => {
  it('skips steps when the base URL is not api.deepseek.com', () => {
    const events = deepseekTurnEvents('deepseek-official', 'deepseek-chat', 0, Date.UTC(2026, 0, 2, 2, 0, 0))
    expect(foldAndInsert(events, 's1', store, NON_MATCHING)).toBe(0)
    expect(store.rowCount()).toBe(0)
  })

  it('skips steps from other provider routes', () => {
    const events = deepseekTurnEvents('pi-ai', 'deepseek-chat', 0, Date.UTC(2026, 0, 2, 2, 0, 0))
    expect(foldAndInsert(events, 's1', store, OTHER_PROVIDER)).toBe(0)
    expect(store.rowCount()).toBe(0)
  })

  it('counts failed requests from the matching endpoint', () => {
    const events = [
      ev('request/header', { reason: 'initial', header: { config: { provider: 'deepseek-official', model: 'deepseek-chat' } } }, 0, 1000),
      ev('step/start', { turn: 0, step: 0 }, 1, 1100),
      ev('turn/end', { turn: 0, reason: { kind: 'error', error: { message: 'boom', code: 'X' } } }, 2, 1200),
    ]
    expect(foldAndInsert(events, 's1', store, MATCHING)).toBe(1)
    expect(store.allRows()[0].failed).toBe(true)
  })
})

describe('multi-session capture', () => {
  it('records concurrent sessions without cross-talk', () => {
    const a = deepseekTurnEvents('deepseek-official', 'deepseek-chat', 0, Date.UTC(2026, 0, 2, 2, 0, 0))
    const b = deepseekTurnEvents('deepseek-official', 'deepseek-reasoner', 0, Date.UTC(2026, 0, 2, 3, 0, 0))
    foldAndInsert(a, 'session-a', store, MATCHING)
    foldAndInsert(b, 'session-b', store, MATCHING)
    const rows = store.allRows()
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.sessionId).sort()).toEqual(['session-a', 'session-b'])
    expect(rows.find(row => row.sessionId === 'session-b')?.model).toBe('deepseek-reasoner')
  })
})
