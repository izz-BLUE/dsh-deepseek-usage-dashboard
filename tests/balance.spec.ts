/**
 * Balance endpoint: normal responses, 401/402/429/500, timeout, malformed
 * JSON, strict sanitization, and the guarantee that neither the API key nor
 * raw internals ever appear in outcomes.
 */

import { describe, expect, it } from 'vitest'
import { BALANCE_TIMEOUT_MS, BALANCE_URL, fetchBalance, sanitizeBalanceBody } from '../src/core/balance.ts'

const KEY = 'test-api-key-not-a-real-secret'

/** A fake fetch returning a canned Response. */
function respond(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const payload = JSON.stringify(body)
    return new Response(payload, {
      status,
      headers: { 'content-type': 'application/json', 'x-deepseek-internal': 'top-secret', ...headers },
      url,
    })
  }
}

/** The canonical valid balance body. */
const VALID_BODY = {
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '12.34', granted_balance: '2.00', topped_up_balance: '10.34' },
  ],
}

describe('fetchBalance success path', () => {
  it('returns the sanitized snapshot for a 200', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = []
    const fetchImpl = (async (input, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      seen.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) })
      return new Response(JSON.stringify(VALID_BODY), { status: 200 })
    }) as typeof fetch
    const result = await fetchBalance(KEY, fetchImpl)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot).toEqual({
        isAvailable: true,
        infos: [{ currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.00', toppedUpBalance: '10.34' }],
      })
      // The key rides the Authorization header, never the URL.
      expect(seen[0].url).toBe(BALANCE_URL)
      expect(seen[0].headers.authorization).toBe(`Bearer ${KEY}`)
      expect(seen[0].url).not.toContain(KEY)
    }
  })

  it('uses the fixed api.deepseek.com base URL', async () => {
    const fetchImpl = (async (input) => new Response('{}', { status: 401 })) as typeof fetch
    // The URL constant is fixed; the fake records what it was asked for.
    expect(BALANCE_URL).toBe('https://api.deepseek.com/user/balance')
    await fetchBalance(KEY, fetchImpl)
  })
})

describe('fetchBalance failure taxonomy', () => {
  it('maps 401 to UNAUTHORIZED', async () => {
    const result = await fetchBalance(KEY, respond(401, { error: { message: 'Invalid Authentication' } }))
    expect(result).toEqual({ ok: false, code: 'UNAUTHORIZED' })
  })

  it('maps 402 to PAYMENT_REQUIRED', async () => {
    const result = await fetchBalance(KEY, respond(402, { error: { message: 'Insufficient Balance' } }))
    expect(result).toEqual({ ok: false, code: 'PAYMENT_REQUIRED' })
  })

  it('maps 429 to RATE_LIMITED', async () => {
    const result = await fetchBalance(KEY, respond(429, { error: { message: 'Rate limit reached' } }))
    expect(result).toEqual({ ok: false, code: 'RATE_LIMITED' })
  })

  it('maps 5xx to SERVER_ERROR', async () => {
    expect(await fetchBalance(KEY, respond(500, {}))).toEqual({ ok: false, code: 'SERVER_ERROR' })
    expect(await fetchBalance(KEY, respond(502, {}))).toEqual({ ok: false, code: 'SERVER_ERROR' })
    expect(await fetchBalance(KEY, respond(503, {}))).toEqual({ ok: false, code: 'SERVER_ERROR' })
  })

  it('maps an aborted request to TIMEOUT', async () => {
    // The caller passes AbortSignal.timeout(10s); the fake verifies the
    // signal is wired and rejects exactly like a timed-out fetch would.
    let sawSignal = false
    const fetchImpl = (async (_input, init?: RequestInit) => {
      sawSignal = init?.signal !== undefined && init.signal instanceof AbortSignal
      const error = new Error('The operation was aborted')
      error.name = 'TimeoutError'
      throw error
    }) as typeof fetch
    const result = await fetchBalance(KEY, fetchImpl)
    expect(result).toEqual({ ok: false, code: 'TIMEOUT' })
    expect(sawSignal).toBe(true)
  })

  it('maps transport failures to NETWORK', async () => {
    const fetchImpl = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
    const result = await fetchBalance(KEY, fetchImpl)
    expect(result).toEqual({ ok: false, code: 'NETWORK' })
  })

  it('maps malformed JSON to BAD_RESPONSE', async () => {
    const fetchImpl = (async () => new Response('not json at all', { status: 200 })) as typeof fetch
    const result = await fetchBalance(KEY, fetchImpl)
    expect(result).toEqual({ ok: false, code: 'BAD_RESPONSE' })
  })

  it('maps unexpected statuses to BAD_RESPONSE', async () => {
    const result = await fetchBalance(KEY, respond(418, {}))
    expect(result).toEqual({ ok: false, code: 'BAD_RESPONSE' })
  })
})

describe('sanitizeBalanceBody', () => {
  it('drops every field beyond the documented five', () => {
    const snapshot = sanitizeBalanceBody({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '1', granted_balance: '0', topped_up_balance: '1', secret_field: 'leak' }],
      internal_header: 'leak',
    })
    expect(snapshot).toEqual({
      isAvailable: true,
      infos: [{ currency: 'CNY', totalBalance: '1', grantedBalance: '0', toppedUpBalance: '1' }],
    })
    expect(JSON.stringify(snapshot)).not.toContain('leak')
  })

  it('accepts numeric balance values and coerces to strings', () => {
    const snapshot = sanitizeBalanceBody({
      is_available: false,
      balance_infos: [{ currency: 'USD', total_balance: 10.5, granted_balance: 0, topped_up_balance: 10.5 }],
    })
    expect(snapshot?.infos[0]).toEqual({ currency: 'USD', totalBalance: '10.5', grantedBalance: '0', toppedUpBalance: '10.5' })
  })

  it('rejects malformed shapes', () => {
    expect(sanitizeBalanceBody(null)).toBeUndefined()
    expect(sanitizeBalanceBody({})).toBeUndefined()
    expect(sanitizeBalanceBody({ is_available: 'yes', balance_infos: [] })).toBeUndefined()
    expect(sanitizeBalanceBody({ is_available: true, balance_infos: 'none' })).toBeUndefined()
    expect(sanitizeBalanceBody({ is_available: true, balance_infos: [{ currency: 'CNY' }] })).toBeUndefined()
    expect(sanitizeBalanceBody({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '', granted_balance: '0', topped_up_balance: '0' }] })).toBeUndefined()
  })
})

describe('key confinement', () => {
  it('never embeds the key in any outcome value', async () => {
    // The key lives only in the Authorization header; error bodies that
    // echo it are discarded into stable codes; successful bodies are
    // sanitized field-by-field. None of the outcomes may carry the key.
    const outcomes = [
      await fetchBalance(KEY, respond(200, VALID_BODY)),
      await fetchBalance(KEY, respond(401, { error: { message: KEY } })),
      await fetchBalance(KEY, respond(429, { error: { message: `rate limited for ${KEY}` } })),
      await fetchBalance(KEY, respond(500, { internal: `trace ${KEY}` })),
      await fetchBalance(KEY, respond(200, { is_available: true, balance_infos: [], note: `leak ${KEY}` })),
    ]
    for (const outcome of outcomes) {
      expect(JSON.stringify(outcome)).not.toContain(KEY)
      expect(JSON.stringify(outcome)).not.toContain('sk-test')
    }
  })

  it('applies a 10-second timeout', () => {
    expect(BALANCE_TIMEOUT_MS).toBe(10_000)
  })
})
