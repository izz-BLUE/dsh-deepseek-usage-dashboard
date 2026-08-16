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

/** One model's price entry (legacy display rows). */
export interface PriceEntryWire {
  model: string
  cacheHitInputPricePerMillion: number
  cacheMissInputPricePerMillion: number
  outputPricePerMillion: number
  currency: string
  effectiveFrom: string
}

/** One model's rates inside a schedule (the "current rate" line of the card). */
export interface TokenRatesWire {
  cacheHitInputPricePerMillion: number
  cacheMissInputPricePerMillion: number
  outputPricePerMillion: number
}

/** One schedule's identity served to the browser. */
export interface PriceScheduleWire {
  id: string
  effectiveFrom: string
  currency: string
  windowCount: number
  /** Declared windows (times + band mapping) — band display data. */
  windows: Array<{ id: string; start: string; end: string; bandId: string | null }>
  /** Implicit off-peak spans (complement of the windows), "HH:MM" ranges. */
  offPeakSpans: Array<{ start: string; end: string }>
  /** Per-model rates by band. */
  models: Array<{ model: string; ratesByBand: Record<string, TokenRatesWire> }>
}

/** How the pricing config is expressed. */
export type PricingModeWire = 'legacy' | 'time-aware'

/** The band the current instant falls into (lightweight UI hint only). */
export interface CurrentBandWire {
  scheduleId: string
  bandId: string
  /** The window that matched, or null for the implicit off-peak band. */
  windowId: string | null
  /** The matched window's span, or the off-peak span containing now (implicit band). */
  window: { id: string | null; start: string; end: string } | null
  timezone: string
}

/** One band's share of one day's estimate. */
export interface BandCostShareWire {
  bandId: string
  /** This band's estimated cost in integer micro-units (1e-6 of `currency`). */
  totalMicro: string
  /** Rows priced under this band. */
  requestCount: number
  cacheHitInputTokens: number
  cacheMissInputTokens: number
  outputTokens: number
}

/** One day's cost estimate with explicit priced/unpriced accounting. */
export interface DayCostEstimateWire {
  /** Total estimated cost as a decimal string in `currency` units. */
  total: string
  /** Total estimated cost in integer micro-units (1e-6 of `currency`). */
  totalMicro: string
  currency: string
  /** Rows priced under a schedule (failed rows never count). */
  pricedRequestCount: number
  /** Rows with usage that could not be priced. */
  unpricedRequestCount: number
  /** Tokens of the unpriced rows — NEVER folded into `total`. */
  unpriced: {
    cacheHitInputTokens: number
    cacheMissInputTokens: number
    outputTokens: number
  }
  /** Schedule ids that priced this day (several when a day spans schedules). */
  scheduleIdsUsed: string[]
  /** One entry per resolved band, in order of first appearance. */
  bandCosts: BandCostShareWire[]
}

/** The full stats payload. */
export interface UsageStatsWire {
  daily: DailyStatsWire
  trend: DailyStatsWire[]
  estimatedCost: DayCostEstimateWire
  prices: {
    version: number
    updatedAt: string | null
    entries: PriceEntryWire[]
    mode: PricingModeWire
    timezone: string
    schedules: PriceScheduleWire[]
    currentBand: CurrentBandWire | null
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
