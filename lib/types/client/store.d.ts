/**
 * Client-side stats store: one shared poller for the dashboard panel and the
 * composer dock line. Polling is a local HTTP GET against the Host — it
 * consumes zero tokens, so idle or refreshing the page never costs anything.
 */
import type { UsageApi, UsageStatsWire } from './api.ts';
/** The store's public snapshot. */
export interface UsageStoreSnapshot {
    data: UsageStatsWire | null;
    /** Stable error code of the last failed fetch, or null. */
    error: string | null;
    /** Whether a fetch is in flight. */
    loading: boolean;
    /** Whether a manual refresh is in flight. */
    refreshing: boolean;
}
/** Reactive store over one UsageApi instance. */
export declare class UsageStore {
    private readonly api;
    private snapshot;
    private readonly listeners;
    private timer;
    private pollMs;
    /** @param api - the API client.
     * @param pollMs - automatic poll interval (default 60s). */
    constructor(api: UsageApi, pollMs?: number);
    getSnapshot(): UsageStoreSnapshot;
    subscribe(listener: () => void): () => void;
    /** Start polling (initial fetch + interval). */
    start(): void;
    /** Stop polling. */
    stop(): void;
    /** One background fetch (no spinner; keeps the last good data on failure). */
    fetch(): Promise<void>;
    /** Force a balance refresh, then re-fetch stats. */
    refresh(): Promise<void>;
    private publish;
}
//# sourceMappingURL=store.d.ts.map