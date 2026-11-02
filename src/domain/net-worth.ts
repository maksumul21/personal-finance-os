import { ZERO, toMoney, type Money, type MoneyInput } from "./money";
import type { Day } from "./period";

/**
 * Net worth (ARCHITECTURE.md › Ledger model, D-030):
 *   accounts (investments at market value) + manual assets − manual liabilities.
 * Manual items take the latest valuation on or before the date; before their first valuation
 * they count as zero. Pure, no I/O.
 */

export interface Valuation {
  date: Day;
  value: MoneyInput;
}

/** The value in force on `asOf`, or null when nothing was recorded by then. */
export function valueOn(valuations: Valuation[], asOf: Day): { value: Money; date: Day } | null {
  let best: Valuation | null = null;
  for (const v of valuations) if (v.date <= asOf && (!best || v.date > best.date)) best = v;
  return best ? { value: toMoney(best.value), date: best.date } : null;
}

export interface ManualItemInput {
  kind: "ASSET" | "LIABILITY";
  valuations: Valuation[];
}

/** Signed contribution to net worth: + value for assets, − amount owed for liabilities. */
export function manualContribution(item: ManualItemInput, asOf: Day): Money {
  const v = valueOn(item.valuations, asOf)?.value ?? ZERO;
  return item.kind === "ASSET" ? v : v.negated();
}

/** Change between two net worth figures; percent is null when the earlier one is zero. */
export function netWorthChange(now: MoneyInput, before: MoneyInput): { amount: Money; pct: Money | null } {
  const n = toMoney(now);
  const b = toMoney(before);
  const amount = n.minus(b);
  return { amount, pct: b.isZero() ? null : amount.div(b.abs()).times(100) };
}
