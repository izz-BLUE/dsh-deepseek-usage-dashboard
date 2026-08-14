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
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
/** The official DeepSeek provider route (per the adapter README). */
export const DEFAULT_DEEPSEEK_PROVIDER = 'deepseek-official';
/** The base-URL host that qualifies for counting. */
export const DEEPSEEK_API_HOST = 'api.deepseek.com';
/** Launch-environment key used by the official DeepSeek adapter. */
const DEEPSEEK_BASE_URL_ENV = 'DEEPSEEK_BASE_URL';
/**
 * Resolve the current DeepSeek endpoint facts using the official adapter's
 * base-URL precedence without importing the adapter at runtime.
 * Re-resolution is cheap (in-memory settings read) and is performed at every
 * capture decision, so a settings edit reaches the next request without a
 * restart.
 * @param ctx - host context (settings + launch environment).
 * @param providerId - the provider route id this plugin counts as DeepSeek.
 */
export function resolveDeepseekEndpoint(ctx, providerId) {
    let section;
    const settings = ctx.get('settings');
    if (settings !== undefined) {
        const raw = settings.get(settingsNamespace('llm-deepseek'));
        if (typeof raw === 'object' && raw !== null)
            section = raw;
    }
    const configuredBaseUrl = typeof section?.baseURL === 'string' ? section.baseURL : undefined;
    const environmentBaseUrl = launchEnvironmentOf(ctx).get(DEEPSEEK_BASE_URL_ENV)?.value;
    const baseUrl = configuredBaseUrl ?? environmentBaseUrl ?? 'https://api.deepseek.com';
    let host;
    try {
        host = new URL(baseUrl).hostname.toLowerCase();
    }
    catch {
        host = '';
    }
    return { providerId, baseUrl, matches: host === DEEPSEEK_API_HOST };
}
/** The credential reference name for the DeepSeek API key. */
export function deepseekApiKeyRef(ctx) {
    const settings = ctx.get('settings');
    if (settings !== undefined) {
        const raw = settings.get(settingsNamespace('llm-deepseek'));
        if (typeof raw === 'object' && raw !== null) {
            const apiKeyEnv = raw.apiKeyEnv;
            if (typeof apiKeyEnv === 'string' && apiKeyEnv.trim() !== '')
                return apiKeyEnv.trim();
        }
    }
    return 'DEEPSEEK_API_KEY';
}
