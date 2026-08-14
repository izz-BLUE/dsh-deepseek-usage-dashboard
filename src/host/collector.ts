/**
 * Usage capture: live projection drive + restart catch-up scan.
 *
 * Live path: register the `deepseekUsage` projection into
 * `ctx.sessionProjections` (the same replayable registry dsh-live-stats
 * uses) and persist settled step records through the change feed. The
 * registry drives the pure fold over every committed session event, so the
 * capture needs no subscription to session internals.
 *
 * Restart path: sessions already folded before this plugin loaded are never
 * re-notified, so a startup scan refolds every session's persisted event log
 * through `ctx.sessionQuery` and inserts anything missing — idempotent
 * because every write is `INSERT OR IGNORE` on
 * `(session_id, turn, step)`.
 *
 * Both paths funnel through the same store; the SQLite UNIQUE constraint is
 * the final backstop against duplicate accumulation (projection replays,
 * duplicate streaming usage, re-scans, duplicate submissions).
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection/types'
import {
  applyDeepseekUsageEvent,
  createDeepseekUsageProjectionDefinition,
  initDeepseekUsageState,
  type DeepseekUsageProjection,
  type DeepseekUsageState,
  type StepRecord,
} from '../core/projection.ts'
import type { UsageRow, UsageStore } from '../core/sqlite-store.ts'
import type { DeepseekEndpointFacts } from './endpoint.ts'

/** Endpoint facts resolver (re-resolved per capture decision). */
export type EndpointFactsResolver = () => DeepseekEndpointFacts

/** Whether one settled step is a DeepSeek request this plugin counts. */
function isCountedStep(facts: DeepseekEndpointFacts, record: StepRecord): boolean {
  return facts.matches && record.provider === facts.providerId
}

/**
 * Register the live capture path (projection + change feed).
 * @param ctx - host context with sessionProjections.
 * @param store - the durable store.
 * @param facts - endpoint facts resolver.
 * @returns disposer unregistering both.
 */
export function registerUsageCapture(ctx: Context, store: UsageStore, facts: EndpointFactsResolver): () => void {
  // Per-session watermark: the highest step seq already persisted. The feed
  // delivers cumulative values, so only records past the watermark are new.
  const watermarks = new Map<string, number>()

  const disposeProjection = ctx.sessionProjections.register(createDeepseekUsageProjectionDefinition())

  const disposeListener = ctx.sessionProjections.onChanged((
    session: Session,
    key: string,
    value: unknown,
  ) => {
    if (key !== 'deepseekUsage') return
    const projection = value as DeepseekUsageProjection
    const sessionId = session.id
    const watermark = watermarks.get(sessionId) ?? -1
    const endpoint = facts()
    const fresh: UsageRow[] = []
    let newest = watermark
    for (const record of projection.steps) {
      if (record.seq <= watermark) continue
      if (record.seq > newest) newest = record.seq
      if (!isCountedStep(endpoint, record)) continue
      fresh.push({ sessionId, ...record })
    }
    if (fresh.length === 0) {
      if (newest > watermark) watermarks.set(sessionId, newest)
      return
    }
    const outcome = store.insertRows(fresh)
    if (outcome.ignored > 0) {
      // Rows were already persisted (restart replay); advance past them.
      newest = Math.max(newest, ...fresh.map(row => row.seq))
    }
    watermarks.set(sessionId, newest)
  })

  return () => {
    disposeProjection()
    disposeListener()
  }
}

/**
 * Catch-up scan: refold every session's persisted event log and insert rows
 * missing from the store. Safe to run repeatedly (idempotent inserts).
 * @param ctx - host context with sessionQuery.
 * @param store - the durable store.
 * @param facts - endpoint facts resolver.
 * @returns the number of rows inserted by this scan.
 */
export async function scanAllSessions(ctx: Context, store: UsageStore, facts: EndpointFactsResolver): Promise<number> {
  const sessionQuery = ctx.get('sessionQuery')
  if (sessionQuery === undefined) return 0
  const records = await sessionQuery.listSessions()
  let inserted = 0
  for (const record of records) {
    const sessionId = record.header.id
    try {
      const snapshot = await sessionQuery.readSession(sessionId)
      inserted += foldAndInsert(snapshot.events, sessionId, store, facts())
    } catch (error) {
      // A broken session log must not block the scan of the others.
      ctx.logger.warn(`deepseek-usage: scan of session ${sessionId} failed`, error instanceof Error ? error.message : String(error))
    }
  }
  return inserted
}

/** Fold one session's event log and insert the counted step records. */
export function foldAndInsert(
  events: readonly SessionEvent[],
  sessionId: string,
  store: UsageStore,
  endpoint: DeepseekEndpointFacts,
): number {
  let state: DeepseekUsageState = initDeepseekUsageState()
  for (const event of events) {
    state = applyDeepseekUsageEvent(state, event)
  }
  const rows: UsageRow[] = []
  for (const record of state.steps) {
    if (isCountedStep(endpoint, record)) rows.push({ sessionId, ...record })
  }
  return store.insertRows(rows).inserted
}
