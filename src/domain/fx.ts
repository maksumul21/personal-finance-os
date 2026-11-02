import { round2, toMoney, type Money, type MoneyInput } from "./money";
import type { Day } from "./period";

/**
 * Currency conversion uses only rates the user recorded (PRD §18.4). Nothing here guesses.
 * A rate means: 1 unit of `currency` = `rate` units of the base currency.
 */

export interface RecordedRate {
  currency: string;
  date: Day;
  rate: MoneyInput;
}

/** The most recent recorded rate on or before `onOrBefore`, or null. */
export function pickRate(rates: Iterable<RecordedRate>, currency: string, onOrBefore: Day): Money | null {
  let best: RecordedRate | null = null;
  for (const r of rates) {
    if (r.currency !== currency || r.date > onOrBefore) continue;
    if (!best || r.date > best.date) best = r;
  }
  return best ? toMoney(best.rate) : null;
}

/** Converts to the base currency. Same currency needs no rate; otherwise null without one. */
export function toBase(
  amount: MoneyInput,
  currency: string,
  baseCurrency: string,
  rate: MoneyInput | null,
): Money | null {
  if (currency === baseCurrency) return toMoney(amount);
  if (rate === null) return null;
  return round2(toMoney(amount).times(toMoney(rate)));
}
