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
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { fetchBalance } from "../core/balance.js";
/** Resolve the current DeepSeek credential (credentials seam first, env fallback). */
export async function resolveDeepseekApiKey(ctx, refName) {
    const credentials = ctx.get('credentials');
    if (credentials !== undefined) {
        try {
            const resolved = await credentials.resolve(credentialRef(refName));
            if (resolved !== undefined && resolved.value.trim() !== '')
                return resolved.value.trim();
        }
        catch {
            // Credential provider failure: fall through to the environment.
        }
    }
    const fallback = process.env[refName];
    return fallback !== undefined && fallback.trim() !== '' ? fallback.trim() : undefined;
}
/** The balance watch service. */
export class BalanceWatch {
    ctx;
    store;
    deps;
    status;
    timer;
    refreshing;
    stopped = false;
    /**
     * @param ctx - host context (interval lifecycle rides the plugin fiber).
     * @param store - durable store (snapshots survive restarts).
     * @param deps - key ref, interval, and change notification.
     */
    constructor(ctx, store, deps) {
        this.ctx = ctx;
        this.store = store;
        this.deps = deps;
        const stored = store.loadBalance();
        this.status = stored === undefined
            ? { state: 'unconfigured', snapshot: null, lastSuccessAt: null, lastErrorCode: null }
            : { state: 'ok', snapshot: stored.snapshot, lastSuccessAt: stored.fetchedAtMs, lastErrorCode: null };
    }
    /** The current public status. */
    getStatus() {
        return this.status;
    }
    /** Start the periodic refresh (fires immediately, then on the interval). */
    start() {
        void this.refreshNow();
        this.schedule();
    }
    /** Recursive scheduling: the interval re-reads the config every cycle, so a
     * settings edit to `refreshMinutes` applies at the next tick — and the
     * timer is never created before the first refresh settles. */
    schedule() {
        if (this.stopped || this.timer !== undefined)
            return;
        const minutes = Math.max(1, Math.round(this.deps.refreshMinutes()));
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.refreshNow().finally(() => { this.schedule(); });
        }, minutes * 60_000);
        this.timer.unref?.();
    }
    /** Stop the periodic refresh (plugin teardown). */
    stop() {
        this.stopped = true;
        if (this.timer !== undefined)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    /** Force one refresh now (manual refresh route). */
    async refreshNow() {
        // One in-flight refresh at a time; concurrent callers await the same run.
        if (this.refreshing === undefined) {
            this.refreshing = this.perform().finally(() => { this.refreshing = undefined; });
        }
        await this.refreshing;
        return this.status;
    }
    async perform() {
        if (this.stopped)
            return;
        const refName = this.deps.apiKeyRef();
        const apiKey = await resolveDeepseekApiKey(this.ctx, refName);
        if (apiKey === undefined) {
            this.status = { state: 'unconfigured', snapshot: this.status.snapshot, lastSuccessAt: this.status.lastSuccessAt, lastErrorCode: 'NO_KEY' };
            this.deps.onSettled?.();
            return;
        }
        const result = await fetchBalance(apiKey);
        if (result.ok) {
            const fetchedAt = Date.now();
            this.status = {
                state: 'ok',
                snapshot: result.snapshot,
                lastSuccessAt: fetchedAt,
                lastErrorCode: null,
            };
            this.store.saveBalance(result.snapshot, fetchedAt, 'ok');
        }
        else {
            // Keep the last good snapshot; mark stale so the UI says so.
            this.status = {
                state: this.status.snapshot === null ? 'unconfigured' : 'stale',
                snapshot: this.status.snapshot,
                lastSuccessAt: this.status.lastSuccessAt,
                lastErrorCode: result.code,
            };
        }
        this.deps.onSettled?.();
    }
}
