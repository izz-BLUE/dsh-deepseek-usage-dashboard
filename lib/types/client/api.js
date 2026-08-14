/**
 * Browser-side API client for the /api/deepseek-usage route family.
 * Plain fetch against relative URLs (the GUI origin) — no API key or
 * credential ever appears in a request from the browser.
 */
/** Browser API client for the usage routes. */
export class UsageApi {
    /** Fetch the current stats snapshot. */
    async stats() {
        const response = await fetch('/api/deepseek-usage/stats', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });
        if (!response.ok)
            throw new Error(`usage stats: HTTP ${response.status}`);
        return (await response.json());
    }
    /** Force a balance refresh (Host-side fetch), then re-read stats. */
    async refreshBalance() {
        const response = await fetch('/api/deepseek-usage/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: '{}',
            cache: 'no-store',
        });
        if (!response.ok)
            throw new Error(`usage refresh: HTTP ${response.status}`);
        await response.json();
        return await this.stats();
    }
}
/** Format a token count with grouping separators. */
export function formatCount(value) {
    return value.toLocaleString('en-US');
}
