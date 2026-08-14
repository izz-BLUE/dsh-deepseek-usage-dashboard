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
export const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** The per-request timeout (requirement: 10 seconds). */
export const BALANCE_TIMEOUT_MS = 10_000

/** One currency's balance line (all amounts as decimal strings). */
export interface BalanceInfo {
  currency: string
  totalBalance: string
  grantedBalance: string
  toppedUpBalance: string
}

/** The sanitized balance snapshot served to the browser. */
export interface BalanceSnapshot {
  isAvailable: boolean
  infos: BalanceInfo[]
}

/** Stable failure taxonomy surfaced to the UI (never raw internals). */
export type BalanceErrorCode =
  | 'NO_KEY'
  | 'UNAUTHORIZED'
  | 'PAYMENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'BAD_RESPONSE'
  | 'NETWORK'

/** Outcome of one balance fetch. */
export type BalanceResult =
  | { ok: true; snapshot: BalanceSnapshot }
  | { ok: false; code: BalanceErrorCode }

/** Coerce one DeepSeek balance value to its decimal-string form. */
function balanceString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/**
 * Validate and sanitize one raw balance response body. Returns `undefined`
 * for a malformed body (BAD_RESPONSE) — nothing from the raw body survives
 * except the five documented fields.
 */
export function sanitizeBalanceBody(body: unknown): BalanceSnapshot | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const record = body as Record<string, unknown>
  if (typeof record.is_available !== 'boolean') return undefined
  if (!Array.isArray(record.balance_infos)) return undefined
  const infos: BalanceInfo[] = []
  for (const raw of record.balance_infos) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const entry = raw as Record<string, unknown>
    const currency = typeof entry.currency === 'string' && entry.currency.trim() !== '' ? entry.currency.trim() : undefined
    const totalBalance = balanceString(entry.total_balance)
    const grantedBalance = balanceString(entry.granted_balance)
    const toppedUpBalance = balanceString(entry.topped_up_balance)
    if (currency === undefined || totalBalance === undefined || grantedBalance === undefined || toppedUpBalance === undefined) {
      return undefined
    }
    infos.push({ currency, totalBalance, grantedBalance, toppedUpBalance })
  }
  return { isAvailable: record.is_available, infos }
}

/**
 * Fetch the DeepSeek balance once. Direct Host fetch — this never touches
 * any LLM interface.
 * @param apiKey - the resolved DeepSeek credential (Host-side only).
 * @param fetchImpl - fetch implementation (tests inject a fake).
 * @returns the sanitized snapshot, or a stable failure code.
 */
export async function fetchBalance(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BalanceResult> {
  let response: Response
  try {
    response = await fetchImpl(BALANCE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return { ok: false, code: 'TIMEOUT' }
    if (error instanceof Error && error.name === 'AbortError') return { ok: false, code: 'TIMEOUT' }
    return { ok: false, code: 'NETWORK' }
  }
  if (response.status === 401) return { ok: false, code: 'UNAUTHORIZED' }
  if (response.status === 402) return { ok: false, code: 'PAYMENT_REQUIRED' }
  if (response.status === 429) return { ok: false, code: 'RATE_LIMITED' }
  if (response.status >= 500) return { ok: false, code: 'SERVER_ERROR' }
  if (response.status !== 200) return { ok: false, code: 'BAD_RESPONSE' }
  let text: string
  try {
    text = await response.text()
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, code: 'BAD_RESPONSE' }
  }
  const snapshot = sanitizeBalanceBody(parsed)
  return snapshot === undefined ? { ok: false, code: 'BAD_RESPONSE' } : { ok: true, snapshot }
}
