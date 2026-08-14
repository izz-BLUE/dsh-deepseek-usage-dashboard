/**
 * Decimal money arithmetic for cost estimation.
 *
 * Prices are configured per million tokens with up to 6 decimals (CNY).
 * Every accumulation happens in integer MICRO units (1e-6 of the currency
 * unit) using BigInt — ordinary floats are never summed, so estimates cannot
 * drift. The final cost is serialized as a decimal STRING.
 */
/** Integer micro-units (1e-6 of one currency unit); never summed as floats. */
export type MicroAmount = bigint;
/** Scale factor: micro-units per currency unit. */
export declare const MICRO_SCALE = 1000000n;
/**
 * Convert a configured per-million price into micro-units per million tokens.
 * The price must be finite and non-negative; values beyond 6 decimals round.
 */
export declare function priceToMicroPerMillion(pricePerMillion: number): MicroAmount;
/**
 * The micro-unit cost of `tokens` at a per-million price:
 * `tokens * price / 1e6` in micro-units, rounded half-up on the final
 * sub-micro fraction.
 */
export declare function tokensCostMicro(tokens: number, pricePerMillion: number): MicroAmount;
/** Sum micro amounts (the only accumulation path — integer BigInt addition). */
export declare function sumMicro(values: Iterable<MicroAmount>): MicroAmount;
/** Render micro-units as a decimal string with `decimals` fraction digits. */
export declare function formatMicro(value: MicroAmount, decimals?: number): string;
/** Render micro-units as a decimal string without trailing zeros (min 2 digits). */
export declare function formatMicroCompact(value: MicroAmount): string;
//# sourceMappingURL=money.d.ts.map