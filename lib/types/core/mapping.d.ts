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
 * Reproduce the official adapter's `mapUsage` exactly (equivalence pinned by
 * tests): `cacheRead = prompt_tokens_details?.cached_tokens ??
 * prompt_cache_hit_tokens`, `inputTokens = prompt_tokens - cacheRead`.
 */
export declare function mapWireUsage(usage: WireUsage): TokenUsage;
/**
 * Convert a harness TokenUsage (as produced by {@link mapWireUsage}) into
 * daily buckets. Returns `undefined` when the usage is missing or carries
 * invalid counts (callers then record nothing for the step).
 */
export declare function bucketsFromTokenUsage(usage: TokenUsage | undefined): UsageBuckets | undefined;
/** The zero buckets (no tokens). */
export declare function zeroBuckets(): UsageBuckets;
//# sourceMappingURL=mapping.d.ts.map