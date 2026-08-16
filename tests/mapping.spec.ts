/**
 * The plugin's wire-usage mapping and the runtime bucket path.
 *
 * `mapWireUsage` prefers the native DeepSeek billing fields (deliberately
 * diverging from the official adapter, which prefers the OpenAI-compat
 * `cached_tokens` spelling and discards `prompt_cache_miss_tokens`):
 *
 *   cacheHit  = prompt_cache_hit_tokens ?? prompt_tokens_details?.cached_tokens
 *   cacheMiss = prompt_cache_miss_tokens ?? max(0, prompt_tokens - cacheHit)
 *   output    = completion_tokens
 *   reasoning = completion_tokens_details?.reasoning_tokens
 *
 * The runtime capture path sees only the adapter's harness `TokenUsage`, so
 * `bucketsFromTokenUsage` keeps `cacheHit = cacheReadTokens`,
 * `cacheMiss = inputTokens` exactly as the harness reports (see
 * `src/core/mapping.ts` for the documented limitation).
 */

import { describe, expect, it } from 'vitest'
import { bucketsFromTokenUsage, mapWireUsage, zeroBuckets, type WireUsage } from '../src/core/mapping.ts'

describe('mapWireUsage (native billing fields first)', () => {
  it('case A: both native fields map directly', () => {
    const usage = mapWireUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      prompt_cache_hit_tokens: 800,
      prompt_cache_miss_tokens: 200,
    })
    expect(usage.cacheReadTokens).toBe(800)
    expect(usage.inputTokens).toBe(200)
    expect(usage.outputTokens).toBe(200)
  })

  it('case B: native fields win over the cached_tokens spelling', () => {
    // prompt_tokens_details.cached_tokens is NOT proven semantically equal to
    // prompt_cache_hit_tokens, so it must never override a present native hit.
    const usage = mapWireUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_cache_hit_tokens: 800,
      prompt_cache_miss_tokens: 200,
      prompt_tokens_details: { cached_tokens: 850 },
    })
    expect(usage.cacheReadTokens).toBe(800)
    expect(usage.inputTokens).toBe(200)
  })

  it('case C: miss falls back to the residual when only the hit is reported', () => {
    const usage = mapWireUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_cache_hit_tokens: 800,
    })
    expect(usage.cacheReadTokens).toBe(800)
    expect(usage.inputTokens).toBe(200)
  })

  it('case D: cached_tokens is the fallback spelling when the native hit is absent', () => {
    const usage = mapWireUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 800 },
    })
    expect(usage.cacheReadTokens).toBe(800)
    expect(usage.inputTokens).toBe(200)
  })

  it('case E: never crashes on invalid or negative values', () => {
    // Negative native hit passes through the reference mapping…
    const negativeHit = mapWireUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_cache_hit_tokens: -5,
      prompt_cache_miss_tokens: 200,
    })
    expect(negativeHit.cacheReadTokens).toBe(-5)
    expect(negativeHit.inputTokens).toBe(200)
    // …and the runtime bucket path rejects it instead of accumulating garbage.
    expect(bucketsFromTokenUsage(negativeHit)).toBeUndefined()

    // A hit larger than prompt_tokens clamps the derived miss to zero.
    const overHit = mapWireUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_cache_hit_tokens: 1200,
    })
    expect(overHit.cacheReadTokens).toBe(1200)
    expect(overHit.inputTokens).toBe(0)
    expect(() => mapWireUsage({ prompt_tokens: Number.NaN, completion_tokens: 0 })).not.toThrow()
  })

  it('maps the documented DeepSeek fields with reasoning', () => {
    const wire: WireUsage = {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_cache_hit_tokens: 30,
      prompt_cache_miss_tokens: 70,
      completion_tokens_details: { reasoning_tokens: 5 },
    }
    const usage = mapWireUsage(wire)
    expect(usage.inputTokens).toBe(70)
    expect(usage.outputTokens).toBe(20)
    expect(usage.cacheReadTokens).toBe(30)
    expect(usage.reasoningTokens).toBe(5)
    // DeepSeek never reports cache-write tokens; the adapter never sets them.
    expect(usage.cacheWriteTokens).toBeUndefined()
  })

  it('maps a full payload with native miss present', () => {
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

  it('omits cache and reasoning fields when the wire reports none', () => {
    const usage = mapWireUsage({ prompt_tokens: 100, completion_tokens: 10 })
    expect(usage.inputTokens).toBe(100)
    expect(usage.cacheReadTokens).toBeUndefined()
    expect(usage.reasoningTokens).toBeUndefined()
    expect(usage.cacheWriteTokens).toBeUndefined()
  })
})

describe('bucketsFromTokenUsage (runtime bucket path)', () => {
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

  it('rejects invalid counts instead of accumulating garbage or crashing', () => {
    expect(bucketsFromTokenUsage({ inputTokens: -1, outputTokens: 0 })).toBeUndefined()
    expect(bucketsFromTokenUsage({ inputTokens: 1.5, outputTokens: 0 })).toBeUndefined()
    expect(bucketsFromTokenUsage({ inputTokens: Number.NaN, outputTokens: 0 })).toBeUndefined()
    expect(bucketsFromTokenUsage({ inputTokens: 0, outputTokens: 0, cacheReadTokens: -1 })).toBeUndefined()
    expect(bucketsFromTokenUsage({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 1.5 })).toBeUndefined()
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
