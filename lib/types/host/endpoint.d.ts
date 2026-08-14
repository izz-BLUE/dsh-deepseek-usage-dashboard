/**
 * DeepSeek endpoint facts: which provider route is the official DeepSeek
 * route, and whether its effective base URL belongs to api.deepseek.com.
 *
 * The session log records only `provider`/`model` (no base URL), so the
 * endpoint is resolved with the same base-URL precedence as the official
 * adapter: the `llm-deepseek` settings section, then the launch environment's
 * `DEEPSEEK_BASE_URL`, then the public default. Keeping this small resolution
 * local avoids loading the whole adapter (and all of its runtime peers) just
 * to read one configuration value. Only requests whose effective base URL
 * host is `api.deepseek.com` are counted.
 */
import type { Context } from '@deepseek-ai/cordis';
/** The official DeepSeek provider route (per the adapter README). */
export declare const DEFAULT_DEEPSEEK_PROVIDER = "deepseek-official";
/** The base-URL host that qualifies for counting. */
export declare const DEEPSEEK_API_HOST = "api.deepseek.com";
/** Effective endpoint facts for one resolution. */
export interface DeepseekEndpointFacts {
    /** Provider route id counted as DeepSeek. */
    providerId: string;
    /** The effective base URL the adapter would use. */
    baseUrl: string;
    /** Whether the effective base URL belongs to api.deepseek.com. */
    matches: boolean;
}
/**
 * Resolve the current DeepSeek endpoint facts using the official adapter's
 * base-URL precedence without importing the adapter at runtime.
 * Re-resolution is cheap (in-memory settings read) and is performed at every
 * capture decision, so a settings edit reaches the next request without a
 * restart.
 * @param ctx - host context (settings + launch environment).
 * @param providerId - the provider route id this plugin counts as DeepSeek.
 */
export declare function resolveDeepseekEndpoint(ctx: Context, providerId: string): DeepseekEndpointFacts;
/** The credential reference name for the DeepSeek API key. */
export declare function deepseekApiKeyRef(ctx: Context): string;
//# sourceMappingURL=endpoint.d.ts.map