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
import { applyDeepseekUsageEvent, createDeepseekUsageProjectionDefinition, initDeepseekUsageState, } from "../core/projection.js";
/** Whether one settled step is a DeepSeek request this plugin counts. */
function isCountedStep(facts, record) {
    return facts.matches && record.provider === facts.providerId;
}
/**
 * Register the live capture path (projection + change feed).
 * @param ctx - host context with sessionProjections.
 * @param store - the durable store.
 * @param facts - endpoint facts resolver.
 * @returns disposer unregistering both.
 */
export function registerUsageCapture(ctx, store, facts) {
    // Per-session watermark: the highest step seq already persisted. The feed
    // delivers cumulative values, so only records past the watermark are new.
    const watermarks = new Map();
    const disposeProjection = ctx.sessionProjections.register(createDeepseekUsageProjectionDefinition());
    const disposeListener = ctx.sessionProjections.onChanged((session, key, value) => {
        if (key !== 'deepseekUsage')
            return;
        const projection = value;
        const sessionId = session.id;
        const watermark = watermarks.get(sessionId) ?? -1;
        const endpoint = facts();
        const fresh = [];
        let newest = watermark;
        for (const record of projection.steps) {
            if (record.seq <= watermark)
                continue;
            if (record.seq > newest)
                newest = record.seq;
            if (!isCountedStep(endpoint, record))
                continue;
            fresh.push({ sessionId, ...record });
        }
        if (fresh.length === 0) {
            if (newest > watermark)
                watermarks.set(sessionId, newest);
            return;
        }
        const outcome = store.insertRows(fresh);
        if (outcome.ignored > 0) {
            // Rows were already persisted (restart replay); advance past them.
            newest = Math.max(newest, ...fresh.map(row => row.seq));
        }
        watermarks.set(sessionId, newest);
    });
    return () => {
        disposeProjection();
        disposeListener();
    };
}
/**
 * Catch-up scan: refold every session's persisted event log and insert rows
 * missing from the store. Safe to run repeatedly (idempotent inserts).
 * @param ctx - host context with sessionQuery.
 * @param store - the durable store.
 * @param facts - endpoint facts resolver.
 * @returns the number of rows inserted by this scan.
 */
export async function scanAllSessions(ctx, store, facts) {
    const sessionQuery = ctx.get('sessionQuery');
    if (sessionQuery === undefined)
        return 0;
    const records = await sessionQuery.listSessions();
    let inserted = 0;
    for (const record of records) {
        const sessionId = record.header.id;
        try {
            const snapshot = await sessionQuery.readSession(sessionId);
            inserted += foldAndInsert(snapshot.events, sessionId, store, facts());
        }
        catch (error) {
            // A broken session log must not block the scan of the others.
            ctx.logger.warn(`deepseek-usage: scan of session ${sessionId} failed`, error instanceof Error ? error.message : String(error));
        }
    }
    return inserted;
}
/** Fold one session's event log and insert the counted step records. */
export function foldAndInsert(events, sessionId, store, endpoint) {
    let state = initDeepseekUsageState();
    for (const event of events) {
        state = applyDeepseekUsageEvent(state, event);
    }
    const rows = [];
    for (const record of state.steps) {
        if (isCountedStep(endpoint, record))
            rows.push({ sessionId, ...record });
    }
    return store.insertRows(rows).inserted;
}
