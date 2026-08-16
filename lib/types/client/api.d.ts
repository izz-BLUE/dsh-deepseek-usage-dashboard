/**
 * Browser-side API client for the /api/deepseek-usage route family.
 * Plain fetch against relative URLs (the GUI origin) — no API key or
 * credential ever appears in a request from the browser.
 */
/** One day's aggregated statistics (mirror of the host payload). */
export interface DailyStatsWire {
    date: string;
    cacheHitInputTokens: number;
    cacheMissInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalInputTokens: number;
    totalTokens: number;
    requestCount: number;
    failedRequestCount: number;
    cacheHitRate: number | null;
}
/** One currency's balance line. */
export interface BalanceInfoWire {
    currency: string;
    totalBalance: string;
    grantedBalance: string;
    toppedUpBalance: string;
}
/** The sanitized balance snapshot. */
export interface BalanceSnapshotWire {
    isAvailable: boolean;
    infos: BalanceInfoWire[];
}
/** One model's price entry (legacy display rows). */
export interface PriceEntryWire {
    model: string;
    cacheHitInputPricePerMillion: number;
    cacheMissInputPricePerMillion: number;
    outputPricePerMillion: number;
    currency: string;
    effectiveFrom: string;
}
/** One schedule's identity served to the browser. */
export interface PriceScheduleWire {
    id: string;
    effectiveFrom: string;
    currency: string;
    windowCount: number;
}
/** How the pricing config is expressed. */
export type PricingModeWire = 'legacy' | 'schedules';
/** One day's cost estimate with explicit priced/unpriced accounting. */
export interface DayCostEstimateWire {
    /** Total estimated cost as a decimal string in `currency` units. */
    total: string;
    /** Total estimated cost in integer micro-units (1e-6 of `currency`). */
    totalMicro: string;
    currency: string;
    /** Rows priced under a schedule (failed rows never count). */
    pricedRequestCount: number;
    /** Rows with usage that could not be priced. */
    unpricedRequestCount: number;
    /** Tokens of the unpriced rows — NEVER folded into `total`. */
    unpriced: {
        cacheHitInputTokens: number;
        cacheMissInputTokens: number;
        outputTokens: number;
    };
    /** Schedule ids that priced this day (several when a day spans schedules). */
    scheduleIdsUsed: string[];
}
/** The full stats payload. */
export interface UsageStatsWire {
    daily: DailyStatsWire;
    trend: DailyStatsWire[];
    estimatedCost: DayCostEstimateWire;
    prices: {
        version: number;
        updatedAt: string | null;
        entries: PriceEntryWire[];
        mode: PricingModeWire;
        timezone: string;
        schedules: PriceScheduleWire[];
    };
    balance: BalanceSnapshotWire | null;
    balanceOmitted: boolean;
    balanceState: {
        state: 'ok' | 'stale' | 'unconfigured';
        lastSuccessAt: number | null;
        lastErrorCode: string | null;
    };
    meta: {
        timezone: string;
        dataSource: string;
        endpointBaseUrl: string;
        endpointMatching: boolean;
        providerId: string;
        updatedAt: number;
    };
}
/** The refresh endpoint payload. */
export interface RefreshWire {
    balance: BalanceSnapshotWire | null;
    balanceState: {
        state: 'ok' | 'stale' | 'unconfigured';
        lastSuccessAt: number | null;
        lastErrorCode: string | null;
    };
}
/** Browser API client for the usage routes. */
export declare class UsageApi {
    /** Fetch the current stats snapshot. */
    stats(): Promise<UsageStatsWire>;
    /** Force a balance refresh (Host-side fetch), then re-read stats. */
    refreshBalance(): Promise<UsageStatsWire>;
}
/** Format a token count with grouping separators. */
export declare function formatCount(value: number): string;
//# sourceMappingURL=api.d.ts.map