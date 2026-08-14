/**
 * DeepSeek usage-field mapping.
 *
 * The authoritative mapping lives in the official DeepSeek adapter
 * `@deepseek-ai/dsh-llm-deepseek` (`translate.mapUsage`, documented in the
 * package README and its `types.d.ts`). This module reproduces that mapping
 * VERBATIM so the dashboard's daily buckets mean exactly what the harness
 * adapter means, and pins the equivalence with tests.
 *
 * Wire (DeepSeek chat-completions):
 *   prompt_tokens                       total input incl. cache hits
 *   prompt_cache_hit_tokens             cached input tokens
 *   prompt_tokens_details.cached_tokens alternate spelling of the hit count
 *   prompt_cache_miss_tokens            uncached input tokens
 *   completion_tokens                   output tokens
 *   completion_tokens_details.reasoning_tokens
 *
 * Harness TokenUsage (DISJOINT counts — documented on the dsh-llm
 * `TokenUsage` interface):
 *   inputTokens      = uncached input only = prompt_tokens - cacheRead
 *   cacheReadTokens  = prompt_cache_hit_tokens (cached_tokens spelling wins)
 *   cacheWriteTokens = never reported by DeepSeek (absent)
 *   outputTokens     = completion_tokens
 *   reasoningTokens  = completion_tokens_details.reasoning_tokens
 */
/**
 * Reproduce the official adapter's `mapUsage` exactly (equivalence pinned by
 * tests): `cacheRead = prompt_tokens_details?.cached_tokens ??
 * prompt_cache_hit_tokens`, `inputTokens = prompt_tokens - cacheRead`.
 */
export function mapWireUsage(usage) {
    const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens;
    const reasoning = usage.completion_tokens_details?.reasoning_tokens;
    return {
        inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
        outputTokens: usage.completion_tokens,
        ...(cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {}),
        ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
    };
}
/** True when a non-negative integer (guards garbage usage values). */
function isCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
}
/**
 * Convert a harness TokenUsage (as produced by {@link mapWireUsage}) into
 * daily buckets. Returns `undefined` when the usage is missing or carries
 * invalid counts (callers then record nothing for the step).
 */
export function bucketsFromTokenUsage(usage) {
    if (usage === undefined)
        return undefined;
    const cacheHit = usage.cacheReadTokens ?? 0;
    const cacheMiss = usage.inputTokens;
    const output = usage.outputTokens;
    const reasoning = usage.reasoningTokens ?? 0;
    if (!isCount(cacheHit) || !isCount(cacheMiss) || !isCount(output) || !isCount(reasoning))
        return undefined;
    const cacheWrite = usage.cacheWriteTokens ?? 0;
    const totalInputTokens = cacheHit + cacheMiss + (isCount(cacheWrite) ? cacheWrite : 0);
    return {
        cacheHitInputTokens: cacheHit,
        cacheMissInputTokens: cacheMiss,
        outputTokens: output,
        reasoningTokens: reasoning,
        totalInputTokens,
        totalTokens: totalInputTokens + output,
    };
}
/** The zero buckets (no tokens). */
export function zeroBuckets() {
    return {
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalInputTokens: 0,
        totalTokens: 0,
    };
}
