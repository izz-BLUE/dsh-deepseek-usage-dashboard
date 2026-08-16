/**
 * DeepSeek usage-field mapping.
 *
 * Two layers, deliberately distinct:
 *
 * 1. RUNTIME capture path (what the dashboard actually accumulates): the
 *    official DeepSeek adapter `@deepseek-ai/dsh-llm-deepseek`
 *    (`translate.mapUsage`) converts the wire payload into a harness
 *    `TokenUsage` BEFORE the plugin's projection folds the session events, so
 *    the plugin only ever receives:
 *
 *      cacheReadTokens = prompt_tokens_details?.cached_tokens
 *                       ?? prompt_cache_hit_tokens
 *      inputTokens     = prompt_tokens - cacheRead   (disjoint, uncached only)
 *      outputTokens    = completion_tokens
 *      reasoningTokens = completion_tokens_details?.reasoning_tokens
 *
 *    The adapter DISCARDS the native `prompt_cache_miss_tokens` (it derives
 *    `inputTokens` by subtraction instead). The plugin cannot recover it at
 *    runtime — patching the official adapter's `node_modules` copy is out of
 *    scope, so this is a documented limitation, not a plugin bug.
 *    {@link bucketsFromTokenUsage} therefore keeps the runtime buckets EXACTLY
 *    as the harness reports them: `cacheHit = cacheReadTokens`,
 *    `cacheMiss = inputTokens`.
 *
 * 2. WIRE reference mapping ({@link mapWireUsage}): the plugin's OWN mapping
 *    of a DeepSeek wire usage, exported for integrations that map wire
 *    payloads themselves. It deliberately prefers the native DeepSeek billing
 *    fields `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` over the
 *    OpenAI-compat `prompt_tokens_details.cached_tokens` spelling: the two
 *    cache spellings are NOT proven semantically identical, so `cached_tokens`
 *    must never unconditionally override a present `prompt_cache_hit_tokens`.
 *    The miss falls back to the residual `prompt_tokens - cacheHit`, clamped
 *    at zero so a mismatched payload can never produce a negative bucket.
 *    The live capture path never runs this function.
 *
 * Wire (DeepSeek chat-completions):
 *   prompt_tokens                       total input incl. cache hits
 *   prompt_cache_hit_tokens             native cached input tokens
 *   prompt_cache_miss_tokens            native uncached input tokens
 *   prompt_tokens_details.cached_tokens alternate (OpenAI-compat) hit spelling
 *   completion_tokens                   output tokens
 *   completion_tokens_details.reasoning_tokens
 *
 * Harness TokenUsage (DISJOINT counts — documented on the dsh-llm
 * `TokenUsage` interface):
 *   inputTokens      = uncached input only
 *   cacheReadTokens  = cached input
 *   cacheWriteTokens = never reported by DeepSeek (absent)
 *   outputTokens     = completion_tokens
 *   reasoningTokens  = completion_tokens_details.reasoning_tokens
 */
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
/** DeepSeek wire usage as defined by `dsh-llm-deepseek`'s `WireUsage`. */
export interface WireUsage {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    prompt_tokens_details?: {
        cached_tokens?: number;
    };
    completion_tokens_details?: {
        reasoning_tokens?: number;
    };
}
/**
 * The daily bucket fields the dashboard accumulates. `cacheHitInputTokens`
 * and `cacheMissInputTokens` are disjoint; `totalInputTokens` is their sum
 * (DeepSeek never reports cache-write tokens, so they contribute nothing).
 */
export interface UsageBuckets {
    /** DeepSeek prompt_cache_hit_tokens (harness cacheReadTokens). */
    cacheHitInputTokens: number;
    /** DeepSeek prompt_cache_miss_tokens (harness inputTokens, disjoint). */
    cacheMissInputTokens: number;
    /** DeepSeek completion_tokens (harness outputTokens). */
    outputTokens: number;
    /** DeepSeek completion_tokens_details.reasoning_tokens, when reported. */
    reasoningTokens: number;
    /** cacheHit + cacheMiss (+ cacheWrite, always 0 for DeepSeek). */
    totalInputTokens: number;
    /** totalInput + output. */
    totalTokens: number;
}
/**
 * The plugin's wire reference mapping (see module docs for the contrast with
 * the official adapter): native DeepSeek billing fields win, `cached_tokens`
 * is only a fallback spelling, and the miss never goes negative. This
 * function never throws; invalid counts are rejected downstream by
 * {@link bucketsFromTokenUsage}.
 */
export declare function mapWireUsage(usage: WireUsage): TokenUsage;
/**
 * Convert a harness TokenUsage into daily buckets. The runtime capture path
 * sees the adapter's TokenUsage only, so the buckets follow the harness
 * exactly: `cacheHit = cacheReadTokens`, `cacheMiss = inputTokens`. Returns
 * `undefined` when the usage is missing or carries invalid counts (callers
 * then record nothing for the step — never a crash, never garbage).
 */
export declare function bucketsFromTokenUsage(usage: TokenUsage | undefined): UsageBuckets | undefined;
/** The zero buckets (no tokens). */
export declare function zeroBuckets(): UsageBuckets;
//# sourceMappingURL=mapping.d.ts.map