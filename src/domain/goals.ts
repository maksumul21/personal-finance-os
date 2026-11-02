import { differenceInCalendarDays, differenceInCalendarMonths, parseISO } from "date-fns";
import { ZERO, percentOf, toMoney, type Money, type MoneyInput } from "./money";
import type { Day } from "./period";

/**
 * Savings goals (PRD §8). A goal is an allocation, never an expense: saved amounts come from
 * contribution records, and only contributions with a source account move money.
 */

export interface ContributionInput {
  direction: "DEPOSIT" | "WITHDRAWAL";
  amount: MoneyInput;
}

export function savedAmount(contributions: Iterable<ContributionInput>): Money {
  let total = ZERO;
  for (const c of contributions) {
    total = c.direction === "DEPOSIT" ? total.plus(toMoney(c.amount)) : total.minus(toMoney(c.amount));
  }
  return total;
}

export type GoalPace = "achieved" | "on-track" | "behind" | "overdue" | "no-date";

export interface GoalProgress {
  target: Money;
  saved: Money;
  /** PRD §8.2: Remaining = Target − Saved (never below zero). */
  remaining: Money;
  /** PRD §8.2: Saved / Target × 100, capped display at 100 by the UI. */
  progressPct: Money;
  /** Months left including the current one; null without a target date. */
  monthsLeft: number | null;
  /** Remaining ÷ months left; null without a date, zero once achieved. */
  requiredMonthly: Money | null;
  pace: GoalPace;
}

/** Calendar months from `today` to `target`, counting the current month (min 1). */
export function monthsUntil(today: Day, target: Day): number {
  const months = differenceInCalendarMonths(parseISO(target), parseISO(today));
  return Math.max(1, months + (target >= today ? 1 : 0));
}

export function goalProgress(input: {
  target: MoneyInput;
  saved: MoneyInput;
  targetDate: Day | null;
  createdOn: Day;
  today: Day;
}): GoalProgress {
  const target = toMoney(input.target);
  const saved = toMoney(input.saved);
  const remaining = saved.greaterThanOrEqualTo(target) ? ZERO : target.minus(saved);
  const progressPct = percentOf(saved, target) ?? ZERO;

  if (remaining.isZero()) {
    return { target, saved, remaining, progressPct, monthsLeft: null, requiredMonthly: ZERO, pace: "achieved" };
  }
  if (!input.targetDate) {
    return { target, saved, remaining, progressPct, monthsLeft: null, requiredMonthly: null, pace: "no-date" };
  }
  if (input.targetDate < input.today) {
    return { target, saved, remaining, progressPct, monthsLeft: 0, requiredMonthly: remaining, pace: "overdue" };
  }

  const monthsLeft = monthsUntil(input.today, input.targetDate);
  const requiredMonthly = remaining.div(monthsLeft).toDecimalPlaces(2, 0); // round up to the paisa
  // On track when saved ≥ the straight-line share of the target for the time elapsed.
  const totalDays = Math.max(1, differenceInCalendarDays(parseISO(input.targetDate), parseISO(input.createdOn)));
  const elapsedDays = Math.max(0, differenceInCalendarDays(parseISO(input.today), parseISO(input.createdOn)));
  const expected = target.times(Math.min(1, elapsedDays / totalDays));
  return {
    target,
    saved,
    remaining,
    progressPct,
    monthsLeft,
    requiredMonthly,
    pace: saved.greaterThanOrEqualTo(expected.toDecimalPlaces(2)) ? "on-track" : "behind",
  };
}

/** PRD §8.4: Emergency Fund Target = Essential Monthly Expenses × Target Months. */
export function emergencyTarget(essentialMonthly: MoneyInput, months: number): Money {
  return toMoney(essentialMonthly).times(months).toDecimalPlaces(2);
}

/** Months of essential expenses the fund currently covers. */
export function monthsCovered(saved: MoneyInput, essentialMonthly: MoneyInput): Money | null {
  const m = toMoney(essentialMonthly);
  return m.greaterThan(0) ? toMoney(saved).div(m).toDecimalPlaces(1) : null;
}
