import { addMonths, format } from "date-fns";
import { projectBalances, type ForecastFlow } from "./forecast";
import { monthsUntil } from "./goals";
import { MAX_MONTHS, amortizationSchedule, summarize } from "./loans";
import { Money, toMoney, type MoneyInput } from "./money";
import type { Day } from "./period";
import { occurrencesBetween } from "./recurrence";

/**
 * What-if scenarios (ROADMAP Phase 5, DECISIONS.md D-035). Pure and exact, so the page can
 * recalculate as the user types. Built on the loan and forecast maths used elsewhere.
 */

// ───────────────────────────── 1. Extra loan payment ─────────────────────────────

export interface PayoffOutcome {
  /** Null when the payment never clears the loan (doesn't cover interest, or > MAX_MONTHS). */
  months: number | null;
  interest: Money | null;
}

function payoff(owed: MoneyInput, annualRatePct: MoneyInput, payment: Money): PayoffOutcome {
  try {
    const rows = amortizationSchedule(owed, annualRatePct, MAX_MONTHS, payment);
    if (rows.length >= MAX_MONTHS) return { months: null, interest: null };
    const s = summarize(rows);
    return { months: s.months, interest: s.totalInterest };
  } catch {
    return { months: null, interest: null };
  }
}

export interface ExtraPaymentResult {
  base: PayoffOutcome;
  withExtra: PayoffOutcome;
  monthsSaved: number | null;
  interestSaved: Money | null;
}

/** Pays `extra` on top of the EMI every month from now on. */
export function extraLoanPayment(owed: MoneyInput, annualRatePct: MoneyInput, emi: MoneyInput, extra: MoneyInput): ExtraPaymentResult {
  const base = payoff(owed, annualRatePct, toMoney(emi));
  const withExtra = payoff(owed, annualRatePct, toMoney(emi).plus(toMoney(extra)));
  const both = base.months !== null && withExtra.months !== null;
  return {
    base,
    withExtra,
    monthsSaved: both ? base.months! - withExtra.months! : null,
    interestSaved: both ? base.interest!.minus(withExtra.interest!) : null,
  };
}

// ───────────────────────────── 2. Monthly change ─────────────────────────────

export interface ForecastBase {
  today: Day;
  end: Day;
  start: MoneyInput;
  flows: ForecastFlow[];
  dailySpend: MoneyInput;
}

export interface ForecastOutcome {
  lowest: Money;
  lowestDate: Day;
  end: Money;
  firstNegative: Day | null;
}

export interface MonthlyChangeResult {
  base: ForecastOutcome;
  scenario: ForecastOutcome;
  /** Dates the change applies within the forecast. */
  occurrences: Day[];
  endDifference: Money;
}

const outcome = (f: ReturnType<typeof projectBalances>): ForecastOutcome => ({
  lowest: f.lowest.balance,
  lowestDate: f.lowest.date,
  end: f.endBalance,
  firstNegative: f.firstNegative,
});

/**
 * Adds a signed monthly amount (+ more income or less spending, − new expense or lost income) on
 * `dayOfMonth` from today onwards, and compares the forecast with and without it. Days past a
 * month's end clamp to its last day (31 → 30 Nov, 28 Feb).
 */
export function monthlyChange(base: ForecastBase, monthlyAmount: MoneyInput, dayOfMonth: number): MonthlyChangeResult {
  const day = Math.min(Math.max(Math.trunc(dayOfMonth), 1), 31);
  // Anchor on a month with 31 days so the recurrence keeps the requested day where it exists.
  const anchor = `2000-01-${String(day).padStart(2, "0")}`;
  const occurrences = occurrencesBetween({ start: anchor, unit: "MONTHLY", interval: 1 }, base.today, base.end);
  const amount = toMoney(monthlyAmount);
  const without = projectBalances(base);
  const withChange = projectBalances({ ...base, flows: [...base.flows, ...occurrences.map((date) => ({ date, amount }))] });
  return { base: outcome(without), scenario: outcome(withChange), occurrences, endDifference: withChange.endBalance.minus(without.endBalance) };
}

// ───────────────────────────── 3. Goal by monthly saving ─────────────────────────────

export interface GoalResult {
  /** Months of saving needed, counting this month as the first; 0 when already reached. */
  months: number;
  /** Month the goal is reached (yyyy-MM). */
  reachedIn: string;
  /** True/false against the target date; null without one. */
  meetsTarget: boolean | null;
  /** Monthly amount that meets the target date, the same figure the Goals page shows; null without a target. */
  neededForTarget: Money | null;
}

/**
 * Saving `monthly` from this month on, the same counting as the Goals page (`monthsUntil`: this
 * month is the first saving month). Null when the monthly amount isn't positive.
 */
export function goalBySaving(remaining: MoneyInput, monthly: MoneyInput, today: Day, targetDate: Day | null): GoalResult | null {
  const left = toMoney(remaining);
  const m = toMoney(monthly);
  const thisMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1);
  const targetMonths = targetDate ? monthsUntil(today, targetDate) : null;
  const neededForTarget = targetMonths && left.greaterThan(0) ? left.div(targetMonths).toDecimalPlaces(2, Money.ROUND_UP) : null;

  if (!left.greaterThan(0)) return { months: 0, reachedIn: format(thisMonth, "yyyy-MM"), meetsTarget: targetDate ? true : null, neededForTarget: null };
  if (!m.greaterThan(0)) return null;
  const months = left.div(m).ceil().toNumber();
  return {
    months,
    reachedIn: format(addMonths(thisMonth, months - 1), "yyyy-MM"),
    meetsTarget: targetMonths === null ? null : months <= targetMonths,
    neededForTarget,
  };
}
