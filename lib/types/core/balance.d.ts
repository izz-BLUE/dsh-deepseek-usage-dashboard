/**
 * DeepSeek balance client (Host-only).
 *
 * Calls GET https://api.deepseek.com/user/balance with the resolved
 * DeepSeek credential. The base URL is FIXED to https://api.deepseek.com
 * (requirement) — never configurable, never proxied through any other URL.
 *
 * Security contract:
 * - The API key exists only on the Host; it is never logged, never sent to
 *   the browser, and never accepted from request parameters.
 * - Only the sanitized fields below leave this module; raw error bodies,
 *   headers, and the credential never cross the boundary.
 * - HTTP failures map to stable codes: 401 UNAUTHORIZED, 402
 *   PAYMENT_REQUIRED, 429 RATE_LIMITED, 5xx SERVER_ERROR, timeout TIMEOUT,
 *   malformed body BAD_RESPONSE, transport NETWORK, no key NO_KEY.
 */
/** The fixed balance endpoint (requirement: base URL fixed to api.deepseek.com). */
export declare const BALANCE_URL = "https://api.deepseek.com/user/balance";
/** The per-request timeout (requirement: 10 seconds). */
export declare const BALANCE_TIMEOUT_MS = 10000;
/** One currency's balance line (all amounts as decimal strings). */
export interface BalanceInfo {
    currency: string;
    totalBalance: string;
    grantedBalance: string;
    toppedUpBalance: string;
}
/** The sanitized balance snapshot served to the browser. */
export interface BalanceSnapshot {
    isAvailable: boolean;
    infos: BalanceInfo[];
}
/** Stable failure taxonomy surfaced to the UI (never raw internals). */
export type BalanceErrorCode = 'NO_KEY' | 'UNAUTHORIZED' | 'PAYMENT_REQUIRED' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'TIMEOUT' | 'BAD_RESPONSE' | 'NETWORK';
/** Outcome of one balance fetch. */
export type BalanceResult = {
    ok: true;
    snapshot: BalanceSnapshot;
} | {
    ok: false;
    code: BalanceErrorCode;
};
/**
 * Validate and sanitize one raw balance response body. Returns `undefined`
 * for a malformed body (BAD_RESPONSE) — nothing from the raw body survives
 * except the five documented fields.
 */
export declare function sanitizeBalanceBody(body: unknown): BalanceSnapshot | undefined;
/**
 * Fetch the DeepSeek balance once. Direct Host fetch — this never touches
 * any LLM interface.
 * @param apiKey - the resolved DeepSeek credential (Host-side only).
 * @param fetchImpl - fetch implementation (tests inject a fake).
 * @returns the sanitized snapshot, or a stable failure code.
 */
export declare function fetchBalance(apiKey: string, fetchImpl?: typeof fetch): Promise<BalanceResult>;
//# sourceMappingURL=balance.d.ts.map