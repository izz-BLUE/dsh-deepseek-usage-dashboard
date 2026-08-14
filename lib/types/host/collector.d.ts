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
import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { UsageStore } from '../core/sqlite-store.ts';
import type { DeepseekEndpointFacts } from './endpoint.ts';
/** Endpoint facts resolver (re-resolved per capture decision). */
export type EndpointFactsResolver = () => DeepseekEndpointFacts;
/**
 * Register the live capture path (projection + change feed).
 * @param ctx - host context with sessionProjections.
 * @param store - the durable store.
 * @param facts - endpoint facts resolver.
 * @returns disposer unregistering both.
 */
export declare function registerUsageCapture(ctx: Context, store: UsageStore, facts: EndpointFactsResolver): () => void;
/**
 * Catch-up scan: refold every session's persisted event log and insert rows
 * missing from the store. Safe to run repeatedly (idempotent inserts).
 * @param ctx - host context with sessionQuery.
 * @param store - the durable store.
 * @param facts - endpoint facts resolver.
 * @returns the number of rows inserted by this scan.
 */
export declare function scanAllSessions(ctx: Context, store: UsageStore, facts: EndpointFactsResolver): Promise<number>;
/** Fold one session's event log and insert the counted step records. */
export declare function foldAndInsert(events: readonly SessionEvent[], sessionId: string, store: UsageStore, endpoint: DeepseekEndpointFacts): number;
//# sourceMappingURL=collector.d.ts.map