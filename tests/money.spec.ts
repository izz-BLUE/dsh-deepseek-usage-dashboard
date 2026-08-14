/**
 * Money arithmetic: integer micro-unit accumulation only — ordinary floats
 * are never summed, so estimates cannot drift. Verifies BigInt math,
 * formatting, and error paths.
 */

import { describe, expect, it } from 'vitest'
import { formatMicro, formatMicroCompact, priceToMicroPerMillion, sumMicro, tokensCostMicro } from '../src/core/money.ts'

describe('priceToMicroPerMillion', () => {
  it('scales per-million prices into micro-units', () => {
    expect(priceToMicroPerMillion(2)).toBe(2_000_000n)
    expect(priceToMicroPerMillion(0.5)).toBe(500_000n)
    expect(priceToMicroPerMillion(16)).toBe(16_000_000n)
    expect(priceToMicroPerMillion(0.000001)).toBe(1n)
  })

  it('rejects invalid prices', () => {
    expect(() => priceToMicroPerMillion(-1)).toThrow()
    expect(() => priceToMicroPerMillion(Number.NaN)).toThrow()
    expect(() => priceToMicroPerMillion(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('tokensCostMicro', () => {
  it('costs a full million tokens at the per-million price', () => {
    expect(tokensCostMicro(1_000_000, 2)).toBe(2_000_000n) // ¥2 = 2e6 micro
  })

  it('costs fractional token counts without float drift', () => {
    // 500_000 tokens at ¥0.5/M = ¥0.25 = 250_000 micro — exact integer math.
    expect(tokensCostMicro(500_000, 0.5)).toBe(250_000n)
    // 1 token at ¥0.5/M = 0.5 micro — rounds half-up to 1 micro.
    expect(tokensCostMicro(1, 0.5)).toBe(1n)
  })

  it('is exact where float accumulation would drift', () => {
    // 0.1 + 0.2 != 0.3 in floats; the integer path must stay exact.
    const repeated = sumMicro(Array.from({ length: 3 }, () => tokensCostMicro(1_000_000, 0.1)))
    expect(repeated).toBe(300_000n) // exactly ¥0.30 in micro-units
    expect(repeated === 300_000n).toBe(true)
  })

  it('rejects invalid token counts', () => {
    expect(() => tokensCostMicro(-1, 2)).toThrow()
    expect(() => tokensCostMicro(1.5, 2)).toThrow()
    expect(() => tokensCostMicro(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow()
  })
})

describe('sumMicro', () => {
  it('sums integer micro amounts exactly', () => {
    expect(sumMicro([1n, 2n, 3n])).toBe(6n)
    expect(sumMicro([])).toBe(0n)
    // A sum that would lose precision in doubles stays exact in BigInt.
    const large = 90_000_000_000_000_000n // beyond 2^53
    expect(sumMicro([large, 1n])).toBe(large + 1n)
  })
})

describe('formatMicro', () => {
  it('renders decimal strings with the requested digits', () => {
    expect(formatMicro(1_234_567n, 6)).toBe('1.234567')
    expect(formatMicro(2_000_000n, 6)).toBe('2.000000')
    expect(formatMicro(0n, 6)).toBe('0.000000')
    expect(formatMicro(5n, 2)).toBe('0.05')
    expect(formatMicro(123n, 0)).toBe('123')
  })

  it('renders compact form without trailing zeros', () => {
    expect(formatMicroCompact(2_000_000n)).toBe('2.00')
    expect(formatMicroCompact(1_234_567n)).toBe('1.234567')
    expect(formatMicroCompact(123_400n)).toBe('0.1234')
  })
})
