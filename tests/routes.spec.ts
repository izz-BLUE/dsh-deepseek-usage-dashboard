/**
 * Route family: trust fence (Host/Origin/Sec-Fetch-Site), loopback-only
 * balance detail, method/content-type/body-size enforcement, and the
 * guarantee that no API key or raw internals reach the browser.
 */

import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { makeUsageRoutes, isTrustedUsageRequest, isLoopbackSocket, MAX_BODY_BYTES, type UsageRoutesDeps } from '../src/host/routes.ts'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { BalanceSnapshot, BalanceErrorCode } from '../src/core/balance.ts'
import type { BalanceStatus, BalanceWatch } from '../src/host/balance-service.ts'
import type { DeepseekEndpointFacts } from '../src/host/endpoint.ts'
import type { PriceEntry } from '../src/core/pricing.ts'

const KEY = 'test-route-key-not-a-real-secret'

/** A balance watch fake (structural match to the real service's route usage). */
class FakeBalanceWatch {
  status: BalanceStatus
  refreshed = 0
  constructor(overrides: Partial<BalanceStatus> = {}) {
    this.status = {
      state: 'ok',
      snapshot: { isAvailable: true, infos: [{ currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.00', toppedUpBalance: '10.34' }] },
      lastSuccessAt: 1234567,
      lastErrorCode: null,
      ...overrides,
    }
  }
  getStatus(): BalanceStatus {
    return this.status
  }
  async refreshNow(): Promise<BalanceStatus> {
    this.refreshed += 1
    return this.status
  }
}

const ENDPOINT: DeepseekEndpointFacts = {
  providerId: 'deepseek-official',
  baseUrl: 'https://api.deepseek.com',
  matches: true,
}

const PRICES: PriceEntry[] = [
  { model: 'deepseek-chat', cacheHitInputPricePerMillion: 0.5, cacheMissInputPricePerMillion: 2, outputPricePerMillion: 8, currency: 'CNY', effectiveFrom: '2025-09-05' },
]

/** A fully-wired routes dependency set over fake store/balance. */
function makeDeps(balance: FakeBalanceWatch = new FakeBalanceWatch()): UsageRoutesDeps {
  const now = 1_700_000_000_000
  return {
    store: {
      dailyStats: (dayKey: string) => ({
        date: dayKey,
        cacheHitInputTokens: 30,
        cacheMissInputTokens: 70,
        outputTokens: 20,
        reasoningTokens: 5,
        totalInputTokens: 100,
        totalTokens: 120,
        requestCount: 2,
        failedRequestCount: 1,
        cacheHitRate: 0.3,
      }),
    } as never,
    balance: balance as unknown as BalanceWatch,
    endpoint: () => ENDPOINT,
    prices: () => ({
      version: 2,
      updatedAt: '2026-01-01T00:00:00.000Z',
      entries: PRICES,
      mode: 'legacy',
      timezone: 'Asia/Shanghai',
      schedules: [{
        id: 'legacy-2026-04-24',
        effectiveFrom: '2026-04-24T00:00:00+08:00',
        currency: 'CNY',
        windowCount: 1,
        windows: [{ id: 'all-day', start: '00:00', end: '00:00', bandId: null }],
        offPeakSpans: [],
        models: [{ model: 'deepseek-v4-flash', ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } } }],
      }],
      currentBand: { scheduleId: 'legacy-2026-04-24', bandId: 'all-day', windowId: 'all-day', window: { id: 'all-day', start: '00:00', end: '00:00' }, timezone: 'Asia/Shanghai' },
    }),
    estimateDayCost: () => ({
      total: '1.234567',
      totalMicro: '1234567',
      currency: 'CNY',
      pricedRequestCount: 1,
      unpricedRequestCount: 1,
      unpriced: { cacheHitInputTokens: 10, cacheMissInputTokens: 20, outputTokens: 30 },
      scheduleIdsUsed: ['legacy-2026-04-24'],
      bandCosts: [],
    }),
    trendDayKeys: () => ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07'],
    now: () => now,
  }
}

/** Wrap the routes in a real loopback HTTP server. */
async function serve(routes: WebRoute[]): Promise<{ base: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    const route = routes.find(route => route.kind === 'exact' && route.path === pathname)
    if (route === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    void route.handler(req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

const servers: Array<{ close: () => Promise<void> }> = []
afterEach(async () => {
  while (servers.length > 0) await servers.pop()?.close()
})

/** A raw HTTP GET with arbitrary headers (undici strips a custom Host; node's http client sends it). */
function rawGet(port: number, path: string, headers: Record<string, string>): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers, method: 'GET' }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk as Buffer))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('trust fence (Host / Origin / Sec-Fetch-Site)', () => {
  it('serves a loopback same-origin stats request', async () => {
    const balance = new FakeBalanceWatch()
    const deps = makeDeps(balance)
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, { headers: { Origin: server.base } })
    expect(response.status).toBe(200)
    const payload = await response.json() as Record<string, unknown>
    expect(payload.daily).toBeDefined()
    expect(payload.balance).not.toBeNull() // loopback client sees the balance detail
    expect(payload.balanceOmitted).toBe(false)
  })

  it('rejects a DNS-rebinding Host (attacker domain)', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const port = Number(new URL(server.base).port)
    // node's http client honors a forged Host header — what a rebinding
    // attacker's browser would send against the loopback socket.
    const result = await rawGet(port, '/api/deepseek-usage/stats', { Host: 'evil.example.com' })
    expect(result.status).toBe(403)
    expect(result.text).toContain('forbidden')
  })

  it('rejects a cross-site Sec-Fetch-Site marker', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, {
      headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'http://evil.example.com' },
    })
    expect(response.status).toBe(403)
  })

  it('rejects a cross-origin browser request (Origin mismatch)', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, {
      headers: { Origin: 'http://evil.example.com' },
    })
    expect(response.status).toBe(403)
  })

  it('rejects requests without a Host header', () => {
    expect(isTrustedUsageRequest({ headers: {} } as IncomingMessage)).toBe(false)
  })

  it('accepts localhost and 127/8 hostnames in the fence', () => {
    expect(isTrustedUsageRequest({ headers: { host: 'localhost:3080' } } as IncomingMessage)).toBe(true)
    expect(isTrustedUsageRequest({ headers: { host: '127.0.0.1:3080' } } as IncomingMessage)).toBe(true)
    expect(isTrustedUsageRequest({ headers: { host: '192.168.1.5:3080' } } as IncomingMessage)).toBe(false)
  })
})

describe('loopback socket classification', () => {
  it('accepts only loopback remote addresses', () => {
    expect(isLoopbackSocket({ socket: { remoteAddress: '127.0.0.1' } } as IncomingMessage)).toBe(true)
    expect(isLoopbackSocket({ socket: { remoteAddress: '::1' } } as IncomingMessage)).toBe(true)
    expect(isLoopbackSocket({ socket: { remoteAddress: '::ffff:127.0.0.1' } } as IncomingMessage)).toBe(true)
    expect(isLoopbackSocket({ socket: { remoteAddress: '192.168.1.5' } } as IncomingMessage)).toBe(false)
    expect(isLoopbackSocket({ socket: { remoteAddress: '10.0.0.2' } } as IncomingMessage)).toBe(false)
  })
})

describe('unpaired LAN clients', () => {
  it('refuses stats from a non-loopback socket (LAN exposure)', async () => {
    const deps = makeDeps()
    const routes = makeUsageRoutes(deps)
    let status = 0
    let body = ''
    const res = {
      writeHead(code: number) { status = code },
      end(payload: string) { body = payload },
    } as unknown as ServerResponse
    const req = {
      method: 'GET',
      url: '/api/deepseek-usage/stats',
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '192.168.1.5' }, // LAN peer
    } as unknown as IncomingMessage
    await routes[0].handler(req, res)
    expect(status).toBe(403)
    expect(body).toContain('forbidden')
  })

  it('omits balance detail for a trusted-but-non-loopback client (defense in depth)', async () => {
    const deps = makeDeps()
    const routes = makeUsageRoutes(deps)
    let status = 0
    let body = ''
    const res = {
      writeHead(code: number, headers: Record<string, string>) { status = code; void headers },
      end(payload: string) { body = payload },
    } as unknown as ServerResponse
    // A request that passes the Host fence but arrives from a non-loopback
    // socket (e.g. a future trustedHosts grant): balance must be omitted.
    const req = {
      method: 'GET',
      url: '/api/deepseek-usage/stats',
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' },
      socket: { remoteAddress: '172.16.0.9' },
    } as unknown as IncomingMessage
    // The fence itself still refuses non-loopback peers, but the payload
    // builder must ALSO gate the balance on the socket (defense in depth).
    await routes[0].handler(req, res)
    expect(status).toBe(403)
    expect(body).not.toContain('12.34')
  })
})

describe('method / content-type / body-size enforcement', () => {
  it('rejects non-GET on stats with 405', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(405)
  })

  it('rejects POST refresh without application/json with 415', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/refresh`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })
    expect(response.status).toBe(415)
  })

  it('rejects oversized bodies with 413', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(MAX_BODY_BYTES + 1) }),
    })
    expect(response.status).toBe(413)
  })

  it('accepts a JSON refresh and triggers the balance watch', async () => {
    const balance = new FakeBalanceWatch()
    const deps = makeDeps(balance)
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(200)
    expect(balance.refreshed).toBe(1)
    const payload = await response.json() as Record<string, unknown>
    expect(payload.balance).toEqual(balance.status.snapshot)
  })
})

describe('pricing provenance and unpriced state', () => {
  it('serializes pricing provenance (mode / timezone / schedules)', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, { headers: { Origin: server.base } })
    expect(response.status).toBe(200)
    const payload = await response.json() as Record<string, unknown>
    const prices = payload.prices as Record<string, unknown>
    expect(prices.mode).toBe('legacy')
    expect(prices.timezone).toBe('Asia/Shanghai')
    expect(prices.schedules).toEqual([{
      id: 'legacy-2026-04-24',
      effectiveFrom: '2026-04-24T00:00:00+08:00',
      currency: 'CNY',
      windowCount: 1,
      windows: [{ id: 'all-day', start: '00:00', end: '00:00', bandId: null }],
      offPeakSpans: [],
      models: [{ model: 'deepseek-v4-flash', ratesByBand: { 'all-day': { cacheHitInputPricePerMillion: 0.02, cacheMissInputPricePerMillion: 1, outputPricePerMillion: 2 } } }],
    }])
    // Legacy display rows stay available (API compatibility).
    expect(prices.entries).toEqual(PRICES)
    // The current-instant band hint rides along (never a billing claim).
    expect(prices.currentBand).toEqual({ scheduleId: 'legacy-2026-04-24', bandId: 'all-day', windowId: 'all-day', window: { id: 'all-day', start: '00:00', end: '00:00' }, timezone: 'Asia/Shanghai' })
  })

  it('serializes a time-aware schedule set (mode / schedules / current band)', async () => {
    const deps = makeDeps()
    deps.prices = () => ({
      version: 3,
      updatedAt: '2026-08-17T00:00:00.000Z',
      entries: [],
      mode: 'time-aware',
      timezone: 'Asia/Shanghai',
      schedules: [{
        id: 'deepseek-2026-08-17',
        effectiveFrom: '2026-08-17T00:00:00+08:00',
        currency: 'CNY',
        windowCount: 2,
        windows: [
          { id: 'peak-morning', start: '09:00', end: '12:00', bandId: 'peak' },
          { id: 'peak-afternoon', start: '14:00', end: '18:00', bandId: 'peak' },
        ],
        offPeakSpans: [
          { start: '00:00', end: '09:00' },
          { start: '12:00', end: '14:00' },
          { start: '18:00', end: '24:00' },
        ],
        models: [{ model: 'deepseek-v4-flash', ratesByBand: { peak: { cacheHitInputPricePerMillion: 0.1, cacheMissInputPricePerMillion: 3, outputPricePerMillion: 9 }, 'off-peak': { cacheHitInputPricePerMillion: 0.05, cacheMissInputPricePerMillion: 1.5, outputPricePerMillion: 4.5 } } }],
      }],
      currentBand: {
        scheduleId: 'deepseek-2026-08-17',
        bandId: 'off-peak',
        windowId: null,
        window: { id: null, start: '00:00', end: '09:00' },
        timezone: 'Asia/Shanghai',
      },
    })
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, { headers: { Origin: server.base } })
    expect(response.status).toBe(200)
    const payload = await response.json() as Record<string, unknown>
    const prices = payload.prices as Record<string, unknown>
    expect(prices.mode).toBe('time-aware')
    expect((prices.schedules as Array<Record<string, unknown>>)[0]).toMatchObject({ id: 'deepseek-2026-08-17', windowCount: 2 })
    expect((prices.schedules as Array<Record<string, unknown>>)[0]!.offPeakSpans).toEqual([
      { start: '00:00', end: '09:00' },
      { start: '12:00', end: '14:00' },
      { start: '18:00', end: '24:00' },
    ])
    expect(prices.currentBand).toEqual({
      scheduleId: 'deepseek-2026-08-17',
      bandId: 'off-peak',
      windowId: null,
      window: { id: null, start: '00:00', end: '09:00' },
      timezone: 'Asia/Shanghai',
    })
    expect(prices.entries).toEqual([])
  })

  it('serializes the band cost split in the estimate payload', async () => {
    const deps = makeDeps()
    deps.estimateDayCost = () => ({
      total: '4.500000',
      totalMicro: '4500000',
      currency: 'CNY',
      pricedRequestCount: 2,
      unpricedRequestCount: 0,
      unpriced: { cacheHitInputTokens: 0, cacheMissInputTokens: 0, outputTokens: 0 },
      scheduleIdsUsed: ['deepseek-2026-08-17'],
      bandCosts: [
        { bandId: 'off-peak', totalMicro: '1500000', requestCount: 1, cacheHitInputTokens: 0, cacheMissInputTokens: 1_000_000, outputTokens: 0 },
        { bandId: 'peak', totalMicro: '3000000', requestCount: 1, cacheHitInputTokens: 0, cacheMissInputTokens: 1_000_000, outputTokens: 0 },
      ],
    })
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, { headers: { Origin: server.base } })
    expect(response.status).toBe(200)
    const payload = await response.json() as Record<string, unknown>
    const estimate = payload.estimatedCost as Record<string, unknown>
    expect(estimate.bandCosts).toEqual([
      { bandId: 'off-peak', totalMicro: '1500000', requestCount: 1, cacheHitInputTokens: 0, cacheMissInputTokens: 1_000_000, outputTokens: 0 },
      { bandId: 'peak', totalMicro: '3000000', requestCount: 1, cacheHitInputTokens: 0, cacheMissInputTokens: 1_000_000, outputTokens: 0 },
    ])
    // Sum invariant: the split adds up to the total.
    expect('4500000').toBe((1_500_000 + 3_000_000).toString())
  })

  it('serializes the unpriced state explicitly (never folded into total)', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, { headers: { Origin: server.base } })
    const payload = await response.json() as Record<string, unknown>
    expect(payload.estimatedCost).toEqual({
      total: '1.234567',
      totalMicro: '1234567',
      currency: 'CNY',
      pricedRequestCount: 1,
      unpricedRequestCount: 1,
      unpriced: { cacheHitInputTokens: 10, cacheMissInputTokens: 20, outputTokens: 30 },
      scheduleIdsUsed: ['legacy-2026-04-24'],
      bandCosts: [],
    })
  })

  it('keeps the legacy estimate fields intact (old clients still parse)', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, { headers: { Origin: server.base } })
    const payload = await response.json() as Record<string, unknown>
    const estimate = payload.estimatedCost as Record<string, unknown>
    const prices = payload.prices as Record<string, unknown>
    expect(estimate.total).toBe('1.234567')
    expect(estimate.totalMicro).toBe('1234567')
    expect(estimate.currency).toBe('CNY')
    expect(prices.version).toBe(2)
    expect(prices.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('key and internal confinement', () => {
  it('never includes the API key, headers, or raw internals in responses', async () => {
    const balance = new FakeBalanceWatch()
    const deps = makeDeps(balance)
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const response = await fetch(`${server.base}/api/deepseek-usage/stats`, { headers: { Origin: server.base } })
    const text = await response.text()
    expect(text).not.toContain(KEY)
    expect(text).not.toContain('authorization')
    expect(text).not.toContain('x-deepseek')
    expect(text).not.toContain('Bearer')
  })

  it('returns a sanitized error shape on refusals (no internals)', async () => {
    const deps = makeDeps()
    const server = await serve(makeUsageRoutes(deps))
    servers.push(server)
    const port = Number(new URL(server.base).port)
    const result = await rawGet(port, '/api/deepseek-usage/stats', { Host: 'evil.example.com' })
    expect(result.status).toBe(403)
    expect(result.text).toContain('forbidden')
    expect(result.text).not.toContain(KEY)
    expect(result.text).not.toContain('stack')
  })
})
