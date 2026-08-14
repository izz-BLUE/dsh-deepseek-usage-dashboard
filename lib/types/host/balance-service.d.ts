/**
 * Balance watch (Host side).
 *
 * Refreshes the DeepSeek balance on a configurable interval (default 10
 * minutes) and on demand, keeps the LAST GOOD snapshot durably (survives
 * restarts), and reports a `stale` state after a failed refresh — the UI
 * keeps showing the last successful data, never a fabricated one.
 *
 * The API key is resolved per refresh through the credentials seam
 * (`ctx.credentials.resolve` on the llm-deepseek credential reference) with
 * the process environment as the documented fallback — it lives only in the
 * Host process and never reaches logs, the browser, or request parameters.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type BalanceErrorCode, type BalanceSnapshot } from '../core/balance.ts';
import type { UsageStore } from '../core/sqlite-store.ts';
/** Public state of the balance watch, safe for the browser. */
export interface BalanceStatus {
    /** 'ok' last refresh succeeded; 'stale' last refresh failed; 'unconfigured' no key. */
    state: 'ok' | 'stale' | 'unconfigured';
    /** The last good snapshot (durably retained), or null while never fetched. */
    snapshot: BalanceSnapshot | null;
    /** Epoch ms of the last successful fetch, or null. */
    lastSuccessAt: number | null;
    /** Stable code of the last failure, or null. */
    lastErrorCode: BalanceErrorCode | null;
}
/** Resolve the current DeepSeek credential (credentials seam first, env fallback). */
export declare function resolveDeepseekApiKey(ctx: Context, refName: string): Promise<string | undefined>;
/** Dependencies of the balance watch. */
export interface BalanceWatchDeps {
    /** Resolve the credential reference name (llm-deepseek apiKeyEnv). */
    apiKeyRef: () => string;
    /** Refresh interval in minutes. */
    refreshMinutes: () => number;
    /** Called after every refresh settles (drives client notifications). */
    onSettled?: () => void;
}
/** The balance watch service. */
export declare class BalanceWatch {
    private readonly ctx;
    private readonly store;
    private readonly deps;
    private status;
    private timer;
    private refreshing;
    private stopped;
    /**
     * @param ctx - host context (interval lifecycle rides the plugin fiber).
     * @param store - durable store (snapshots survive restarts).
     * @param deps - key ref, interval, and change notification.
     */
    constructor(ctx: Context, store: UsageStore, deps: BalanceWatchDeps);
    /** The current public status. */
    getStatus(): BalanceStatus;
    /** Start the periodic refresh (fires immediately, then on the interval). */
    start(): void;
    /** Recursive scheduling: the interval re-reads the config every cycle, so a
     * settings edit to `refreshMinutes` applies at the next tick — and the
     * timer is never created before the first refresh settles. */
    private schedule;
    /** Stop the periodic refresh (plugin teardown). */
    stop(): void;
    /** Force one refresh now (manual refresh route). */
    refreshNow(): Promise<BalanceStatus>;
    private perform;
}
//# sourceMappingURL=balance-service.d.ts.map