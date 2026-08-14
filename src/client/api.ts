/**
 * Browser-side API client for the /api/deepseek-usage route family.
 * Plain fetch against relative URLs (the GUI origin) — no API key or
 * credential ever appears in a request from the browser.
 */

/** One day's aggregated statistics (mirror of the host payload). */
export interface DailyStatsWire {
  date: string
  cacheHitInputTokens: number
  cacheMissInputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalInputTokens: number
  totalTokens: number
  requestCount: number
  failedRequestCount: number
  cacheHitRate: number | null
}

/** One currency's balance line. */
export interface BalanceInfoWire {
  currency: string
  totalBalance: string
  grantedBalance: string
  toppedUpBalance: string
}

/** The sanitized balance snapshot. */
export interface BalanceSnapshotWire {
  isAvailable: boolean
  infos: BalanceInfoWire[]
}

/** One model's price entry. */
export interface PriceEntryWire {
  model: string
  cacheHitInputPricePerMillion: number
  cacheMissInputPricePerMillion: number
  outputPricePerMillion: number
  currency: string
  effectiveFrom: string
}

/** The full stats payload. */
export interface UsageStatsWire {
  daily: DailyStatsWire
  trend: DailyStatsWire[]
  estimatedCost: {
    total: string
    totalMicro: string
    currency: string
  }
  prices: {
    version: number
    updatedAt: string | null
    entries: PriceEntryWire[]
  }
  balance: BalanceSnapshotWire | null
  balanceOmitted: boolean
  balanceState: {
    state: 'ok' | 'stale' | 'unconfigured'
    lastSuccessAt: number | null
    lastErrorCode: string | null
  }
  meta: {
    timezone: string
    dataSource: string
    endpointBaseUrl: string
    endpointMatching: boolean
    providerId: string
    updatedAt: number
  }
}

/** The refresh endpoint payload. */
export interface RefreshWire {
  balance: BalanceSnapshotWire | null
  balanceState: {
    state: 'ok' | 'stale' | 'unconfigured'
    lastSuccessAt: number | null
    lastErrorCode: string | null
  }
}

/** Browser API client for the usage routes. */
export class UsageApi {
  /** Fetch the current stats snapshot. */
  async stats(): Promise<UsageStatsWire> {
    const response = await fetch('/api/deepseek-usage/stats', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`usage stats: HTTP ${response.status}`)
    return (await response.json()) as UsageStatsWire
  }

  /** Force a balance refresh (Host-side fetch), then re-read stats. */
  async refreshBalance(): Promise<UsageStatsWire> {
    const response = await fetch('/api/deepseek-usage/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`usage refresh: HTTP ${response.status}`)
    await response.json() as RefreshWire
    return await this.stats()
  }
}

/** Format a token count with grouping separators. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}
