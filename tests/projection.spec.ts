/**
 * The pure session-event fold: final-usage settlement only, per-step
 * deduplication, failure attribution, and header capture. Streaming deltas
 * never settle — estimates are never written to the exact statistics.
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { applyDeepseekUsageEvent, initDeepseekUsageState, type DeepseekUsageState } from '../src/core/projection.ts'

/** Build one session event (structural, cast to the SDK type). */
function ev(type: string, data: unknown, seq: number, time: number): SessionEvent {
  return { type, data, seq, time } as SessionEvent
}

/** The mapped usage of a full DeepSeek wire payload. */
const USAGE: TokenUsage = { inputTokens: 70, outputTokens: 20, cacheReadTokens: 30, reasoningTokens: 5 }

/** Fold a list of events over the init state. */
function fold(events: SessionEvent[]): DeepseekUsageState {
  let state = initDeepseekUsageState()
  for (const event of events) state = applyDeepseekUsageEvent(state, event)
  return state
}

const header = ev('request/header', {
  reason: 'initial',
  header: { config: { provider: 'deepseek-official', model: 'deepseek-chat' } },
}, 0, 1000)
const stepStart = ev('step/start', { turn: 0, step: 0 }, 1, 1100)

describe('settlement', () => {
  it('records a step only when the FINAL usage arrives', () => {
    const text = ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'text-delta', index: 0, text: 'hi' } }, 2, 1200)
    let state = fold([header, stepStart, text])
    expect(state.steps).toHaveLength(0) // estimates never settle
    const usage = ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: USAGE } }, 3, 1300)
    state = applyDeepseekUsageEvent(state, usage)
    expect(state.steps).toHaveLength(1)
    const record = state.steps[0]
    expect(record).toMatchObject({
      turn: 0, step: 0, seq: 3, provider: 'deepseek-official', model: 'deepseek-chat',
      cacheHit: 30, cacheMiss: 70, output: 20, reasoning: 5, failed: false,
    })
  })

  it('deduplicates a second usage-bearing event for the same step (assistant/message)', () => {
    const usageChunk = ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: USAGE } }, 3, 1300)
    const message = ev('assistant/message', { turn: 0, step: 0, message: { role: 'assistant', content: [] }, usage: USAGE }, 4, 1400)
    const state = fold([header, stepStart, usageChunk, message])
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0].seq).toBe(3) // the first arrival won
  })

  it('settles from assistant/message when no usage chunk arrived', () => {
    const message = ev('assistant/message', { turn: 0, step: 0, message: { role: 'assistant', content: [] }, usage: USAGE }, 4, 1400)
    const state = fold([header, stepStart, message])
    expect(state.steps).toHaveLength(1)
  })

  it('ignores usage that does not match the active step', () => {
    const stray = ev('assistant/chunk', { turn: 9, step: 9, chunk: { type: 'usage', usage: USAGE } }, 3, 1300)
    const state = fold([header, stepStart, stray])
    expect(state.steps).toHaveLength(0)
  })

  it('ignores a second usage for an already-settled step (duplicate stream usage)', () => {
    const usage1 = ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: USAGE } }, 3, 1300)
    const usage2 = ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: { ...USAGE, outputTokens: 999 } } }, 5, 1500)
    const state = fold([header, stepStart, usage1, usage2])
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0].output).toBe(20)
  })

  it('drops steps without usage on a completed turn', () => {
    const state = fold([header, stepStart, ev('step/end', { turn: 0, step: 0 }, 4, 1400), ev('turn/end', { turn: 0, reason: { kind: 'completed' } }, 5, 1500)])
    expect(state.steps).toHaveLength(0)
  })
})

describe('failures', () => {
  it('records a failed request when the turn ends in error without usage', () => {
    const state = fold([
      header, stepStart,
      ev('step/end', { turn: 0, step: 0 }, 4, 1400),
      ev('turn/end', { turn: 0, reason: { kind: 'error', error: { message: 'boom', code: 'X' } } }, 5, 1500),
    ])
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0]).toMatchObject({ turn: 0, step: 0, failed: true, cacheHit: 0, cacheMiss: 0, output: 0 })
  })

  it('records a failed request on aborted turns without usage', () => {
    const state = fold([
      header, stepStart,
      ev('turn/end', { turn: 0, reason: { kind: 'aborted', reason: { kind: 'user' } } }, 5, 1500),
    ])
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0].failed).toBe(true)
  })

  it('does NOT mark a settled step failed on an aborted turn', () => {
    const usage = ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: USAGE } }, 3, 1300)
    const state = fold([
      header, stepStart, usage,
      ev('turn/end', { turn: 0, reason: { kind: 'aborted', reason: { kind: 'user' } } }, 5, 1500),
    ])
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0].failed).toBe(false)
  })

  it('does not attribute failure to an earlier turn\'s step', () => {
    const state = fold([
      header, stepStart,
      ev('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'boom', code: 'X' } } }, 5, 1500),
    ])
    expect(state.steps).toHaveLength(0)
  })

  it('resets the active step after a turn ends', () => {
    const state = fold([
      header, stepStart,
      ev('turn/end', { turn: 0, reason: { kind: 'completed' } }, 5, 1500),
    ])
    expect(state.last).toBeNull()
  })
})

describe('headers and unrelated events', () => {
  it('captures the latest header for following steps', () => {
    const state = fold([header, stepStart, ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: USAGE } }, 3, 1300)])
    expect(state.steps[0].provider).toBe('deepseek-official')
    expect(state.steps[0].model).toBe('deepseek-chat')
  })

  it('records empty provider/model when no header preceded the step', () => {
    const state = fold([stepStart, ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: USAGE } }, 3, 1300)])
    expect(state.steps[0].provider).toBe('')
    expect(state.steps[0].model).toBe('')
  })

  it('returns the same state reference for unrelated events', () => {
    const state = initDeepseekUsageState()
    const unrelated = ev('user/message', { content: 'hi' }, 0, 1000)
    expect(applyDeepseekUsageEvent(state, unrelated)).toBe(state)
    const todo = ev('todo/write', { items: [] }, 1, 1100)
    expect(applyDeepseekUsageEvent(state, todo)).toBe(state)
  })

  it('ignores non-usage chunks', () => {
    const state = fold([
      header, stepStart,
      ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'block-start', index: 0, blockType: 'text' } }, 2, 1200),
      ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'finish', reason: { kind: 'stop' } } }, 4, 1400),
    ])
    expect(state.steps).toHaveLength(0)
  })

  it('steps settle independently within one turn', () => {
    const step2 = ev('step/start', { turn: 0, step: 1 }, 5, 1600)
    const usage2 = ev('assistant/message', { turn: 0, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 10, outputTokens: 5 } }, 6, 1700)
    const state = fold([header, stepStart, ev('assistant/chunk', { turn: 0, step: 0, chunk: { type: 'usage', usage: USAGE } }, 3, 1300), step2, usage2])
    expect(state.steps).toHaveLength(2)
    expect(state.steps[0].step).toBe(0)
    expect(state.steps[1].step).toBe(1)
  })
})
