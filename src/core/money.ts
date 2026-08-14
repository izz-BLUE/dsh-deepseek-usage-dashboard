/**
 * Decimal money arithmetic for cost estimation.
 *
 * Prices are configured per million tokens with up to 6 decimals (CNY).
 * Every accumulation happens in integer MICRO units (1e-6 of the currency
 * unit) using BigInt — ordinary floats are never summed, so estimates cannot
 * drift. The final cost is serialized as a decimal STRING.
 */

/** Integer micro-units (1e-6 of one currency unit); never summed as floats. */
export type MicroAmount = bigint

/** Scale factor: micro-units per currency unit. */
export const MICRO_SCALE = 1_000_000n

/**
 * Convert a configured per-million price into micro-units per million tokens.
 * The price must be finite and non-negative; values beyond 6 decimals round.
 */
export function priceToMicroPerMillion(pricePerMillion: number): MicroAmount {
  if (!Number.isFinite(pricePerMillion) || pricePerMillion < 0) {
    throw new Error(`deepseek-usage: invalid price ${pricePerMillion}`)
  }
  return BigInt(Math.round(pricePerMillion * 1e6))
}

/**
 * The micro-unit cost of `tokens` at a per-million price:
 * `tokens * price / 1e6` in micro-units, rounded half-up on the final
 * sub-micro fraction.
 */
export function tokensCostMicro(tokens: number, pricePerMillion: number): MicroAmount {
  if (!Number.isSafeInteger(tokens) || tokens < 0) {
    throw new Error(`deepseek-usage: invalid token count ${tokens}`)
  }
  const numerator = BigInt(tokens) * priceToMicroPerMillion(pricePerMillion)
  return (numerator + MICRO_SCALE / 2n) / MICRO_SCALE
}

/** Sum micro amounts (the only accumulation path — integer BigInt addition). */
export function sumMicro(values: Iterable<MicroAmount>): MicroAmount {
  let total = 0n
  for (const value of values) total += value
  return total
}

/** Render micro-units as a decimal string with `decimals` fraction digits. */
export function formatMicro(value: MicroAmount, decimals = 4): string {
  if (decimals < 0 || decimals > 9) throw new Error(`deepseek-usage: bad decimals ${decimals}`)
  const negative = value < 0n
  const absolute = negative ? -value : value
  const scale = 10n ** BigInt(decimals)
  const whole = absolute / scale
  const fraction = (absolute % scale).toString().padStart(decimals, '0')
  const rendered = decimals === 0 ? whole.toString() : `${whole.toString()}.${fraction}`
  return negative ? `-${rendered}` : rendered
}

/** Render micro-units as a decimal string without trailing zeros (min 2 digits). */
export function formatMicroCompact(value: MicroAmount): string {
  const rendered = formatMicro(value, 6)
  const trimmed = rendered.replace(/0+$/, '').replace(/\.$/, '')
  const [whole, fraction] = trimmed.split('.')
  if (fraction === undefined) return `${whole}.00`
  return `${whole}.${fraction.padEnd(2, '0')}`
}
