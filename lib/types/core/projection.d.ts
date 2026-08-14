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
import { z } from 'zod';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
/** One settled step record — the unit the SQLite store persists. */
export interface StepRecord {
    turn: number;
    step: number;
    /** Seq of the event that settled the step (stable across re-scans). */
    seq: number;
    /** Event time (epoch ms) of the settling event. */
    time: number;
    /** Provider route id captured from the request header. */
    provider: string;
    /** Model id captured from the request header. */
    model: string;
    cacheHit: number;
    cacheMiss: number;
    output: number;
    reasoning: number;
    /** True when the request failed before any final usage arrived. */
    failed: boolean;
}
/** The fold state (plain JSON by the projection contract). */
export interface DeepseekUsageState {
    /** The latest request header's route facts (applies to following steps). */
    header: {
        provider: string;
        model: string;
    } | undefined;
    /** Settled step records, in seq order. */
    steps: StepRecord[];
    /** The most recent started step, kept until it settles or its turn ends. */
    last: {
        turn: number;
        step: number;
        seq: number;
        time: number;
        settled: boolean;
    } | null;
}
/** Initial fold state for an empty log. */
export declare function initDeepseekUsageState(): DeepseekUsageState;
/**
 * Fold one session event into the usage state (pure — no I/O).
 * @param state - previous state.
 * @param event - the next committed session event.
 * @returns the next state (same reference when the event is not this fold's).
 */
export declare function applyDeepseekUsageEvent(state: DeepseekUsageState, event: SessionEvent): DeepseekUsageState;
/** The wire value served for the projection (the settled records). */
export interface DeepseekUsageProjection {
    steps: StepRecord[];
}
/** Schema validating the wire projection value. */
export declare const deepseekUsageProjectionSchema: z.ZodType<DeepseekUsageProjection>;
/**
 * The replayable `deepseekUsage` projection definition. Registering it into
 * `ctx.sessionProjections` drives the fold over every committed session event.
 */
export declare function createDeepseekUsageProjectionDefinition(): ProjectionDefinition<'deepseekUsage', DeepseekUsageState>;
//# sourceMappingURL=projection.d.ts.map