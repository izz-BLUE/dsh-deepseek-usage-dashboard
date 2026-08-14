/**
 * The /api/deepseek-usage route family.
 *
 * Every route passes the DSH browser-trust fence first — the same Host /
 * Origin / Sec-Fetch-Site checks the official /api gate applies
 * (`dsh-client-connection`'s api-request-trust; the predicate itself is not
 * exported by the SDK, so this module reproduces its documented semantics
 * verbatim) — plus a loopback socket check. Balance detail is served ONLY
 * to loopback clients; unpaired LAN clients are refused outright. POST
 * routes require `application/json`, request bodies are size-capped, and no
 * response ever carries the API key, raw DeepSeek internals, or headers.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { DailyStats } from '../core/stats.ts';
import type { BalanceSnapshot, BalanceErrorCode } from '../core/balance.ts';
import type { PriceEntry } from '../core/pricing.ts';
import type { UsageStore } from '../core/sqlite-store.ts';
import type { BalanceStatus, BalanceWatch } from './balance-service.ts';
import type { DeepseekEndpointFacts } from './endpoint.ts';
/** Maximum JSON request body (refresh has no meaningful payload). */
export declare const MAX_BODY_BYTES: number;
/** Route prefix owned by this plugin. */
export declare const USAGE_API_PREFIX = "/api/deepseek-usage";
/** One day's cost estimate (decimal strings, never floats on the wire). */
export interface DayCostEstimate {
    /** Total estimated cost as a decimal string in `currency` units. */
    total: string;
    /** Total estimated cost in integer micro-units (1e-6 of `currency`). */
    totalMicro: string;
    currency: string;
}
/** The price table metadata shown next to every estimate. */
export interface PriceTableMeta {
    version: number;
    updatedAt: string | null;
    entries: PriceEntry[];
}
/** The sanitized stats payload served to the browser. */
export interface UsageStatsPayload {
    daily: DailyStats;
    trend: DailyStats[];
    estimatedCost: DayCostEstimate;
    prices: PriceTableMeta;
    balance: BalanceSnapshot | null;
    balanceOmitted: boolean;
    balanceState: {
        state: BalanceStatus['state'];
        lastSuccessAt: number | null;
        lastErrorCode: BalanceErrorCode | null;
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
/** Dependencies of the route family. */
export interface UsageRoutesDeps {
    store: UsageStore;
    balance: BalanceWatch;
    endpoint: () => DeepseekEndpointFacts;
    /** Resolve the price table metadata (version/updatedAt from the store). */
    prices: () => PriceTableMeta;
    /** Estimate one day's cost over the stored rows. */
    estimateDayCost: (dayKey: string) => DayCostEstimate;
    /** The trend day keys (oldest first), ending today. */
    trendDayKeys: () => string[];
    /** Current epoch ms (tests inject a clock). */
    now?: () => number;
}
/**
 * Whether the request's socket peer is loopback (127/8, ::1, v4-mapped).
 */
export declare function isLoopbackSocket(req: IncomingMessage): boolean;
/**
 * The DSH browser-trust fence, reproduced from the official
 * api-request-trust semantics (Host must be loopback — no trustedHosts are
 * declared by this plugin; `sec-fetch-site` must not be cross-site; a
 * present Origin must be same-host). DNS-rebinding defense: over plain HTTP
 * a browser attaches no Origin/Fetch-Metadata to reads, so the Host check is
 * the one rebinding cannot forge.
 */
export declare function isTrustedUsageRequest(req: IncomingMessage): boolean;
/** The combined gate: trust fence + loopback socket. */
export declare function isLoopbackClient(req: IncomingMessage): boolean;
/** Write one JSON response with a no-referrer policy. */
export declare function writeJson(res: ServerResponse, status: number, body: unknown): void;
/**
 * Build the /api/deepseek-usage route family.
 * @param deps - store, balance watch, endpoint facts, pricing.
 * @returns the exact routes to register on webServer.
 */
export declare function makeUsageRoutes(deps: UsageRoutesDeps): WebRoute[];
//# sourceMappingURL=routes.d.ts.map