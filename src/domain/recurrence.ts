import { addDays, addMonths, addWeeks, addYears, format } from "date-fns";
import { ZERO, toMoney, type Money, type MoneyInput } from "./money";
import type { Day } from "./period";

/**
 * One recurrence engine for recurring transactions, bills, the calendar and forecasts.
 * Occurrence k is always computed from the start date (start + k × interval), never from the
 * previous occurrence, so a "31st of the month" schedule doesn't drift to the 28th forever.
 */

export type RepeatUnit = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Schedule {
  start: Day;
  /** Null = happens once, on `start`. */
  unit: RepeatUnit | null;
  interval: number;
  /** Inclusive. */
  end?: Day | null;
}

/** Safety cap so a bad schedule can never loop unbounded. */
const MAX_STEPS = 50_000;

function local(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const toDay = (d: Date): Day => format(d, "yyyy-MM-dd");

/** The k-th occurrence (k ≥ 0), ignoring the end date. */
export function occurrenceAt(s: Schedule, k: number): Day {
  if (!s.unit || k === 0) return s.start;
  const n = k * s.interval;
  const start = local(s.start);
  switch (s.unit) {
    case "DAILY":
      return toDay(addDays(start, n));
    case "WEEKLY":
      return toDay(addWeeks(start, n));
    case "MONTHLY":
      return toDay(addMonths(start, n)); // date-fns clamps 31 Jan + 1 month to 28/29 Feb
    case "YEARLY":
      return toDay(addYears(start, n));
  }
}

/** All occurrences within [from, to] (inclusive), respecting the schedule's end. */
export function occurrencesBetween(s: Schedule, from: Day, to: Day): Day[] {
  const out: Day[] = [];
  const last = s.end && s.end < to ? s.end : to;
  for (let k = 0; k < MAX_STEPS; k++) {
    const d = occurrenceAt(s, k);
    if (d > last) break;
    if (d >= from) out.push(d);
    if (!s.unit) break;
  }
  return out;
}

/** First occurrence on or after `day`, or null when the schedule has ended. */
export function nextOnOrAfter(s: Schedule, day: Day): Day | null {
  for (let k = 0; k < MAX_STEPS; k++) {
    const d = occurrenceAt(s, k);
    if (s.end && d > s.end) return null;
    if (d >= day) return d;
    if (!s.unit) return null;
  }
  return null;
}

/** First occurrence strictly after `day`. */
export function nextAfter(s: Schedule, day: Day): Day | null {
  const next = nextOnOrAfter(s, day);
  if (next !== day) return next;
  for (let k = 0; k < MAX_STEPS; k++) {
    const d = occurrenceAt(s, k);
    if (s.end && d > s.end) return null;
    if (d > day) return d;
    if (!s.unit) return null;
  }
  return null;
}

/** "Every month", "Every 2 weeks", "Quarterly", "Once". */
export function describeSchedule(unit: RepeatUnit | null, interval: number): string {
  if (!unit) return "Once";
  if (unit === "MONTHLY" && interval === 3) return "Quarterly";
  const names: Record<RepeatUnit, [string, string]> = {
    DAILY: ["day", "days"],
    WEEKLY: ["week", "weeks"],
    MONTHLY: ["month", "months"],
    YEARLY: ["year", "years"],
  };
  return interval === 1 ? `Every ${names[unit][0]}` : `Every ${interval} ${names[unit][1]}`;
}

/**
 * Average cost per month of a repeating amount (subscriptions, PRD §9.3).
 * Weekly uses 52 weeks / 12 months; daily uses 365 / 12.
 */
export function monthlyEquivalent(amount: MoneyInput, unit: RepeatUnit | null, interval: number): Money {
  const a = toMoney(amount);
  if (!unit) return ZERO;
  const perYear = { DAILY: 365, WEEKLY: 52, MONTHLY: 12, YEARLY: 1 }[unit] / interval;
  return a.times(perYear).div(12).toDecimalPlaces(2);
}

export function annualEquivalent(amount: MoneyInput, unit: RepeatUnit | null, interval: number): Money {
  if (!unit) return ZERO;
  const perYear = { DAILY: 365, WEEKLY: 52, MONTHLY: 12, YEARLY: 1 }[unit] / interval;
  return toMoney(amount).times(perYear).toDecimalPlaces(2);
}
