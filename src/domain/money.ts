import Decimal from "decimal.js";

/**
 * Exact decimal arithmetic for every monetary value. Never use JS numbers for money.
 * Storage precision is 4 dp (NUMERIC(19,4)); user-entered amounts are limited to 2 dp.
 */
export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
export type Money = Decimal;

/** Anything a money value can be built from. Prisma Decimals pass through `toString()`. */
export type MoneyInput = Decimal.Value | { toString(): string };

export const ZERO = new Money(0);

/** Largest magnitude accepted from user input (fits NUMERIC(19,4) with headroom). */
export const MAX_AMOUNT = new Money("999999999999.99");

export function toMoney(value: MoneyInput): Money {
  if (value instanceof Decimal) return new Money(value);
  if (typeof value === "number" || typeof value === "string") return new Money(value);
  return new Money(value.toString());
}

export function sum(values: Iterable<MoneyInput>): Money {
  let total = ZERO;
  for (const v of values) total = total.plus(toMoney(v));
  return total;
}

/** Round to 2 dp (banker's rounding). Used for derived base-currency amounts. */
export function round2(value: MoneyInput): Money {
  return toMoney(value).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/**
 * Division that refuses a zero denominator. Returns null so callers render "N/A"
 * instead of Infinity / NaN.
 */
export function safeDivide(numerator: MoneyInput, denominator: MoneyInput): Money | null {
  const d = toMoney(denominator);
  if (d.isZero()) return null;
  return toMoney(numerator).div(d);
}

/** (part / whole) × 100, or null when whole is zero. */
export function percentOf(part: MoneyInput, whole: MoneyInput): Money | null {
  const ratio = safeDivide(part, whole);
  return ratio === null ? null : ratio.times(100);
}

/** Serialises for the server → client boundary. Always a plain decimal string, never exponent form. */
export function toMoneyString(value: MoneyInput, dp = 2): string {
  return toMoney(value).toFixed(dp, Decimal.ROUND_HALF_EVEN);
}

/**
 * Parses a user-entered amount ("1,25,000.50", "1200") into Money.
 * Returns null for anything that is not a plain non-negative decimal with ≤ 2 dp.
 */
export function parseAmount(raw: string): Money | null {
  const cleaned = raw.trim().replace(/[,\s৳]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = new Money(cleaned);
  if (value.greaterThan(MAX_AMOUNT)) return null;
  return value;
}
