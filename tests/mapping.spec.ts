/**
 * Pins the DeepSeek wire-usage -> harness TokenUsage mapping to the official
 * adapter's implementation (dsh-llm-deepseek translate.mapUsage):
 *   cacheRead = prompt_tokens_details?.cached_tokens ?? prompt_cache_hit_tokens
 *   inputTokens = prompt_tokens - cacheRead            (disjoint, uncached only)
 *   outputTokens = completion_tokens
 *   reasoningTokens = completion_tokens_details?.reasoning_tokens
 */

import { describe, expect, it } from 'vitest'
import { bucketsFromTokenUsage, mapWireUsage, zeroBuckets, type WireUsage } from '../src/core/mapping.ts'

describe('mapWireUsage (official adapter equivalence)', () => {
  it('maps the documented DeepSeek fields', () => {
    const wire: WireUsage = {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_cache_hit_tokens: 30,
      prompt_cache_miss_tokens: 70,
      completion_tokens_details: { reasoning_tokens: 5 },
    }
    const usage = mapWireUsage(wire)
    // prompt_tokens includes the cache hit; the harness inputTokens is
    // disjoint (uncached only), exactly like the official adapter.
    expect(usage.inputTokens).toBe(70)
    expect(usage.outputTokens).toBe(20)
    expect(usage.cacheReadTokens).toBe(30)
    expect(usage.reasoningTokens).toBe(5)
    // DeepSeek never reports cache-write tokens; the adapter never sets them.
    expect(usage.cacheWriteTokens).toBeUndefined()
  })

  it('prefers the prompt_tokens_details.cached_tokens spelling', () => {
    const usage = mapWireUsage({
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_cache_hit_tokens: 40,
      prompt_tokens_details: { cached_tokens: 55 },
    })
    expect(usage.cacheReadTokens).toBe(55)
    expect(usage.inputTokens).toBe(45)
  })

  it('omits cache and reasoning fields when the wire reports none', () => {
    const usage = mapWireUsage({ prompt_tokens: 100, completion_tokens: 10 })
    expect(usage.inputTokens).toBe(100)
    expect(usage.cacheReadTokens).toBeUndefined()
    expect(usage.reasoningTokens).toBeUndefined()
    expect(usage.cacheWriteTokens).toBeUndefined()
  })

  it('subtracts cache hits even without the miss field', () => {
    const usage = mapWireUsage({
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_cache_hit_tokens: 25,
    })
    expect(usage.inputTokens).toBe(75)
  })

  it('matches the official adapter byte-for-byte on a full payload', () => {
    const wire: WireUsage = {
      prompt_tokens: 1234,
      completion_tokens: 567,
      prompt_cache_hit_tokens: 999,
      prompt_cache_miss_tokens: 235,
      completion_tokens_details: { reasoning_tokens: 88 },
    }
    expect(mapWireUsage(wire)).toEqual({
      inputTokens: 235,
      outputTokens: 567,
      cacheReadTokens: 999,
      reasoningTokens: 88,
    })
  })
})

describe('bucketsFromTokenUsage (daily buckets)', () => {
  it('breaks a mapped usage into disjoint daily buckets', () => {
    const buckets = bucketsFromTokenUsage(mapWireUsage({
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_cache_hit_tokens: 30,
      completion_tokens_details: { reasoning_tokens: 5 },
    }))
    expect(buckets).toEqual({
      cacheHitInputTokens: 30,
      cacheMissInputTokens: 70,
      outputTokens: 20,
      reasoningTokens: 5,
      totalInputTokens: 100,
      totalTokens: 120,
    })
  })

  it('treats absent cache fields as zero hit', () => {
    const buckets = bucketsFromTokenUsage({ inputTokens: 50, outputTokens: 10 })
    expect(buckets?.cacheHitInputTokens).toBe(0)
    expect(buckets?.cacheMissInputTokens).toBe(50)
    expect(buckets?.totalInputTokens).toBe(50)
    expect(buckets?.totalTokens).toBe(60)
    expect(buckets?.reasoningTokens).toBe(0)
  })

  it('returns undefined for missing usage', () => {
    expect(bucketsFromTokenUsage(undefined)).toBeUndefined()
  })

  it('rejects invalid counts instead of accumulating garbage', () => {
    expect(bucketsFromTokenUsage({ inputTokens: -1, outputTokens: 0 })).toBeUndefined()
    expect(bucketsFromTokenUsage({ inputTokens: 1.5, outputTokens: 0 })).toBeUndefined()
    expect(bucketsFromTokenUsage({ inputTokens: Number.NaN, outputTokens: 0 })).toBeUndefined()
  })

  it('provides a zero baseline', () => {
    expect(zeroBuckets()).toEqual({
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalInputTokens: 0,
      totalTokens: 0,
    })
  })
})
