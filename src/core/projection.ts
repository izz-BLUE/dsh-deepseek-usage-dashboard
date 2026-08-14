/**
 * Pure session-event fold for DeepSeek usage capture.
 *
 * Registered into `ctx.sessionProjections` (the replayable projection
 * registry, mirroring how dsh-live-stats registers `liveTokenUsage`): the
 * registry drives `apply` over every committed session event and the change
 * feed hands the host collector the settled step records. The SAME pure
 * function refolds persisted event logs during the startup catch-up scan, so
 * one fold implementation serves both the live path and the restart path.
 *
 * Settlement rules (documented contract):
 * - A step records its usage when the FINAL usage arrives — the
 *   `assistant/chunk` `usage` chunk or the `assistant/message` `usage`
 *   field. Streaming deltas never settle anything; estimates are never
 *   written to the daily exact statistics.
 * - A step whose turn ends `error`/`aborted` without any usage is recorded
 *   as FAILED (a request that never returned final usage).
 * - Only one record per (turn, step): the second usage-bearing event for the
 *   same step is dropped by the fold itself (and the SQLite UNIQUE
 *   constraint backstops it).
 */

import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { bucketsFromTokenUsage } from './mapping.ts'

/** One settled step record — the unit the SQLite store persists. */
export interface StepRecord {
  turn: number
  step: number
  /** Seq of the event that settled the step (stable across re-scans). */
  seq: number
  /** Event time (epoch ms) of the settling event. */
  time: number
  /** Provider route id captured from the request header. */
  provider: string
  /** Model id captured from the request header. */
  model: string
  cacheHit: number
  cacheMiss: number
  output: number
  reasoning: number
  /** True when the request failed before any final usage arrived. */
  failed: boolean
}

/** The fold state (plain JSON by the projection contract). */
export interface DeepseekUsageState {
  /** The latest request header's route facts (applies to following steps). */
  header: { provider: string; model: string } | undefined
  /** Settled step records, in seq order. */
  steps: StepRecord[]
  /** The most recent started step, kept until it settles or its turn ends. */
  last: { turn: number; step: number; seq: number; time: number; settled: boolean } | null
}

/** Initial fold state for an empty log. */
export function initDeepseekUsageState(): DeepseekUsageState {
  return { header: undefined, steps: [], last: null }
}

/** The failure reasons that mark a usage-less step as a failed request. */
const FAILURE_KINDS = new Set(['error', 'aborted'])

/**
 * Fold one session event into the usage state (pure — no I/O).
 * @param state - previous state.
 * @param event - the next committed session event.
 * @returns the next state (same reference when the event is not this fold's).
 */
export function applyDeepseekUsageEvent(state: DeepseekUsageState, event: SessionEvent): DeepseekUsageState {
  switch (event.type) {
    case 'request/header': {
      const config = event.data.header.config
      return { ...state, header: { provider: config.provider, model: config.model } }
    }
    case 'step/start': {
      return {
        ...state,
        last: { turn: event.data.turn, step: event.data.step, seq: event.seq, time: event.time, settled: false },
      }
    }
    case 'assistant/chunk': {
      if (event.data.chunk.type !== 'usage') return state
      return settleStep(state, event.data.turn, event.data.step, event.seq, event.time, event.data.chunk.usage)
    }
    case 'assistant/message': {
      if (event.data.usage === undefined) return state
      return settleStep(state, event.data.turn, event.data.step, event.seq, event.time, event.data.usage)
    }
    case 'turn/end': {
      const turn = event.data.turn
      const failed = FAILURE_KINDS.has(event.data.reason.kind)
      let next = state
      if (failed && next.last !== null && next.last.turn === turn && !next.last.settled) {
        next = { ...next, steps: [...next.steps, failedRecord(next, next.last, event.seq, event.time)] }
      }
      // The turn is over: no later event can settle its last step.
      return { ...next, last: null }
    }
    default:
      return state
  }
}

/** Build the failed record for a usage-less step whose turn errored/aborted. */
function failedRecord(state: DeepseekUsageState, last: NonNullable<DeepseekUsageState['last']>, seq: number, time: number): StepRecord {
  return {
    turn: last.turn,
    step: last.step,
    seq,
    time,
    provider: state.header?.provider ?? '',
    model: state.header?.model ?? '',
    cacheHit: 0,
    cacheMiss: 0,
    output: 0,
    reasoning: 0,
    failed: true,
  }
}

/** Settle the matching active step with final usage (idempotent per step). */
function settleStep(
  state: DeepseekUsageState,
  turn: number,
  step: number,
  seq: number,
  time: number,
  usage: Parameters<typeof bucketsFromTokenUsage>[0],
): DeepseekUsageState {
  const buckets = bucketsFromTokenUsage(usage)
  if (buckets === undefined) return state
  // The step must match the active one; a duplicate usage event (usage chunk
  // then assistant/message) for an already-settled step is dropped here.
  if (state.last === null || state.last.turn !== turn || state.last.step !== step || state.last.settled) {
    return state
  }
  const record: StepRecord = {
    turn,
    step,
    seq,
    time,
    provider: state.header?.provider ?? '',
    model: state.header?.model ?? '',
    cacheHit: buckets.cacheHitInputTokens,
    cacheMiss: buckets.cacheMissInputTokens,
    output: buckets.outputTokens,
    reasoning: buckets.reasoningTokens,
    failed: false,
  }
  return {
    ...state,
    steps: [...state.steps, record],
    last: { ...state.last, settled: true },
  }
}

/** The wire value served for the projection (the settled records). */
export interface DeepseekUsageProjection {
  steps: StepRecord[]
}

/** Schema validating the wire projection value. */
export const deepseekUsageProjectionSchema = z.object({
  steps: z.array(z.object({
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    seq: z.number().int().nonnegative(),
    time: z.number().int().nonnegative(),
    provider: z.string(),
    model: z.string(),
    cacheHit: z.number().int().nonnegative(),
    cacheMiss: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    reasoning: z.number().int().nonnegative(),
    failed: z.boolean(),
  }).strict()),
}).strict() as unknown as z.ZodType<DeepseekUsageProjection>

/**
 * The replayable `deepseekUsage` projection definition. Registering it into
 * `ctx.sessionProjections` drives the fold over every committed session event.
 */
export function createDeepseekUsageProjectionDefinition(): ProjectionDefinition<'deepseekUsage', DeepseekUsageState> {
  return {
    key: 'deepseekUsage',
    schema: deepseekUsageProjectionSchema,
    init: initDeepseekUsageState,
    apply: applyDeepseekUsageEvent,
    view: (state: DeepseekUsageState): DeepseekUsageProjection => ({ steps: state.steps }),
    stateVersion: 1,
  }
}
