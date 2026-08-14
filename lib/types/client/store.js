/**
 * Client-side stats store: one shared poller for the dashboard panel and the
 * composer dock line. Polling is a local HTTP GET against the Host — it
 * consumes zero tokens, so idle or refreshing the page never costs anything.
 */
/** Reactive store over one UsageApi instance. */
export class UsageStore {
    api;
    snapshot = { data: null, error: null, loading: false, refreshing: false };
    listeners = new Set();
    timer;
    pollMs;
    /** @param api - the API client.
     * @param pollMs - automatic poll interval (default 60s). */
    constructor(api, pollMs = 60_000) {
        this.api = api;
        this.pollMs = pollMs;
    }
    getSnapshot() {
        return this.snapshot;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    /** Start polling (initial fetch + interval). */
    start() {
        void this.fetch();
        this.timer = setInterval(() => { void this.fetch(); }, this.pollMs);
        this.timer.unref?.();
    }
    /** Stop polling. */
    stop() {
        if (this.timer !== undefined)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    /** One background fetch (no spinner; keeps the last good data on failure). */
    async fetch() {
        const snapshot = this.snapshot;
        if (snapshot.loading)
            return;
        this.publish({ ...snapshot, loading: true });
        try {
            const data = await this.api.stats();
            this.publish({ ...this.snapshot, data, error: null, loading: false });
        }
        catch (error) {
            this.publish({ ...this.snapshot, error: error instanceof Error ? error.message : String(error), loading: false });
        }
    }
    /** Force a balance refresh, then re-fetch stats. */
    async refresh() {
        const snapshot = this.snapshot;
        if (snapshot.refreshing)
            return;
        this.publish({ ...snapshot, refreshing: true });
        try {
            const data = await this.api.refreshBalance();
            this.publish({ ...this.snapshot, data, error: null, refreshing: false });
        }
        catch (error) {
            this.publish({ ...this.snapshot, error: error instanceof Error ? error.message : String(error), refreshing: false });
        }
    }
    publish(next) {
        this.snapshot = next;
        for (const listener of this.listeners)
            listener();
    }
}
