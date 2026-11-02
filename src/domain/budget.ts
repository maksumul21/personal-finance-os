import { addDays, addMonths, addWeeks, endOfMonth, endOfYear, format, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { ZERO, percentOf, sum, toMoney, type Money, type MoneyInput } from "./money";
import { addDaysTo, type Day, type Period } from "./period";

/**
 * Budget calculations (PRD §6). Pure functions; spending totals come from the ledger via queries.
 * Allocations are planning entries only and never change balances.
 */

export type UsageState = "normal" | "warning" | "critical" | "overspent";

export interface Thresholds {
  warnPct: number;
  criticalPct: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { warnPct: 70, criticalPct: 90 };

/** PRD §6.2 visual states. 100% or more is always overspent. */
export function usageState(usagePct: Money | null, spent: MoneyInput, t: Thresholds = DEFAULT_THRESHOLDS): UsageState {
  // decimal.js treats 0 as positive, so compare explicitly.
  if (usagePct === null) return toMoney(spent).greaterThan(0) ? "overspent" : "normal";
  if (usagePct.greaterThanOrEqualTo(100)) return "overspent";
  if (usagePct.greaterThanOrEqualTo(t.criticalPct)) return "critical";
  if (usagePct.greaterThanOrEqualTo(t.warnPct)) return "warning";
  return "normal";
}

export interface LineInput {
  allocated: MoneyInput;
  spent: MoneyInput;
  /** Carried in from the previous period (0 when rollover is off). */
  carry?: MoneyInput;
}

export interface LineResult {
  allocated: Money;
  carry: Money;
  /** allocated + carry */
  available: Money;
  spent: Money;
  /** PRD §6.2: Remaining = Budget − Actual (negative when overspent). */
  remaining: Money;
  /** PRD §6.2: Actual / Budget × 100; null when nothing is available. */
  usagePct: Money | null;
  state: UsageState;
}

export function budgetLine(input: LineInput, t: Thresholds = DEFAULT_THRESHOLDS): LineResult {
  const allocated = toMoney(input.allocated);
  const carry = toMoney(input.carry ?? 0);
  const spent = toMoney(input.spent);
  const available = allocated.plus(carry);
  const usagePct = percentOf(spent, available);
  return {
    allocated,
    carry,
    available,
    spent,
    remaining: available.minus(spent),
    usagePct,
    state: usageState(usagePct, spent, t),
  };
}

/**
 * Unused budget carried into the next period (PRD §6.6). Overspending is not carried forward
 * by default, so one bad month doesn't shrink the next one unless the user opts in.
 */
export function rolloverAmount(previous: LineInput, carryOverspend = false): Money {
  const remaining = toMoney(previous.allocated).plus(toMoney(previous.carry ?? 0)).minus(toMoney(previous.spent));
  return carryOverspend || remaining.isPositive() ? remaining : ZERO;
}

export interface ZeroBasedResult {
  availableIncome: Money;
  totalAllocated: Money;
  /** PRD §6.4: Total Available Income − Total Planned Allocations. */
  unallocated: Money;
  status: "complete" | "unallocated" | "over-allocated";
}

export function zeroBased(availableIncome: MoneyInput, allocations: Iterable<MoneyInput>): ZeroBasedResult {
  const income = toMoney(availableIncome);
  const totalAllocated = sum(allocations);
  const unallocated = income.minus(totalAllocated);
  return {
    availableIncome: income,
    totalAllocated,
    unallocated,
    status: unallocated.isZero() ? "complete" : unallocated.isPositive() ? "unallocated" : "over-allocated",
  };
}

// ───────────────────────────── Templates (PRD §6.5) ─────────────────────────────

export type BudgetMethod = "STANDARD" | "ZERO_BASED" | "FIFTY_THIRTY_TWENTY" | "SEVENTY_TWENTY_TEN";
/**
 * needs = essential expense categories, wants = other expense categories, living = both,
 * savings = savings + investment lines, debt = debt-repayment lines.
 */
export type Bucket = "needs" | "wants" | "living" | "savings" | "debt";

/** Target share of income per bucket. */
export const TEMPLATE_TARGETS: Partial<Record<BudgetMethod, Partial<Record<Bucket, number>>>> = {
  FIFTY_THIRTY_TWENTY: { needs: 50, wants: 30, savings: 20 },
  SEVENTY_TWENTY_TEN: { living: 70, savings: 20, debt: 10 },
};

export interface BucketPlan {
  bucket: Bucket;
  targetPct: number;
  target: Money;
  planned: Money;
  /** Positive when more could be planned to meet the target. */
  difference: Money;
}

export function templateBuckets(
  method: BudgetMethod,
  income: MoneyInput,
  planned: Record<Bucket, MoneyInput>,
): BucketPlan[] | null {
  const targets = TEMPLATE_TARGETS[method];
  if (!targets) return null;
  const inc = toMoney(income);
  return (Object.entries(targets) as [Bucket, number][]).map(([bucket, targetPct]) => {
    const target = inc.times(targetPct).div(100).toDecimalPlaces(2);
    const p = toMoney(planned[bucket]);
    return { bucket, targetPct, target, planned: p, difference: target.minus(p) };
  });
}

// ───────────────────────────── Periods ─────────────────────────────

export type BudgetPeriodType = "WEEKLY" | "MONTHLY" | "ANNUAL" | "CUSTOM";

function local(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const toDay = (d: Date): Day => format(d, "yyyy-MM-dd");

/** The period of the given type that contains `day`. CUSTOM periods are entered by the user. */
export function periodContaining(type: Exclude<BudgetPeriodType, "CUSTOM">, day: Day, weekStartsOn = 6): Period {
  const d = local(day);
  switch (type) {
    case "WEEKLY": {
      const start = startOfWeek(d, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
      return { start: toDay(start), end: toDay(addDays(start, 6)) };
    }
    case "MONTHLY":
      return { start: toDay(startOfMonth(d)), end: toDay(endOfMonth(d)) };
    case "ANNUAL":
      return { start: toDay(startOfYear(d)), end: toDay(endOfYear(d)) };
  }
}

/** The period of the same type and length immediately before `period` (for rollover and comparison). */
export function previousPeriod(type: BudgetPeriodType, period: Period): Period {
  const start = local(period.start);
  switch (type) {
    case "WEEKLY": {
      const s = addWeeks(start, -1);
      return { start: toDay(s), end: toDay(addDays(s, 6)) };
    }
    case "MONTHLY": {
      const s = addMonths(start, -1);
      return { start: toDay(s), end: toDay(endOfMonth(s)) };
    }
    case "ANNUAL": {
      const s = new Date(start.getFullYear() - 1, 0, 1);
      return { start: toDay(s), end: toDay(endOfYear(s)) };
    }
    case "CUSTOM": {
      const lengthDays = Math.round((local(period.end).getTime() - start.getTime()) / 86_400_000);
      const end = addDaysTo(period.start, -1);
      return { start: addDaysTo(end, -lengthDays), end };
    }
  }
}
