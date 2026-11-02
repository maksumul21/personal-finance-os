import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { ZERO, toMoney, type Money, type MoneyInput } from "./money";
import type { Day } from "./period";
import { occurrenceAt, type Schedule } from "./recurrence";

/**
 * Financial calendar (ROADMAP Phase 5). Pure helpers: the month grid, projected loan EMI dates
 * and month totals. Events themselves are assembled from bills, recurring rules, loans and goals
 * by `queries/calendar.query.ts`.
 */

export type EventKind = "BILL" | "RECURRING" | "EMI" | "GOAL";
/** Money direction for the user: IN (income), OUT (spending or debt payment), MOVE (transfer). */
export type Direction = "IN" | "OUT" | "MOVE";
/**
 * DONE = paid/recorded, OVERDUE = due before today and unpaid, DUE = due today or later,
 * PROJECTED = from a schedule, not yet a record, SKIPPED, TARGET = a goal's target date.
 */
export type EventStatus = "DONE" | "OVERDUE" | "DUE" | "PROJECTED" | "SKIPPED" | "TARGET";

export interface CalendarEvent {
  id: string;
  date: Day;
  kind: EventKind;
  title: string;
  /** Plain decimal string in `currency`; null when no amount applies. */
  amount: string | null;
  currency: string;
  direction: Direction | null;
  status: EventStatus;
  /** Where to act on it. */
  href: string;
}

/** Days shown for a `yyyy-MM` month, padded to whole weeks. */
export function monthGrid(month: string, weekStartsOn = 6): { date: Day; inMonth: boolean }[] {
  const first = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const opts = { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  return eachDayOfInterval({ start: startOfWeek(startOfMonth(first), opts), end: endOfWeek(endOfMonth(first), opts) }).map((d) => ({
    date: format(d, "yyyy-MM-dd"),
    inMonth: d.getMonth() === first.getMonth(),
  }));
}

export function shiftMonth(month: string, by: number): string {
  return format(addMonths(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1), by), "yyyy-MM");
}

/**
 * Remaining EMI due dates: `count` monthly instalments starting at `nextDue`, anchored to the
 * loan's first payment date (so a 31st keeps falling on month-end), limited to [from, to].
 */
export function emiDueDates(firstPaymentDate: Day, nextDue: Day, count: number, from: Day, to: Day): Day[] {
  const s: Schedule = { start: firstPaymentDate, unit: "MONTHLY", interval: 1 };
  let k = 0;
  while (occurrenceAt(s, k) < nextDue && k < 1200) k++;
  const out: Day[] = [];
  for (let i = 0; i < count; i++) {
    const d = occurrenceAt(s, k + i);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export interface MonthTotals {
  /** Recorded in the ledger (income / spending incl. bill and EMI interest; transfers excluded). */
  actualIn: Money;
  actualOut: Money;
  /** Still expected this month, base currency only: projected income and unpaid outflows. */
  expectedIn: Money;
  expectedOut: Money;
  overdueCount: number;
}

/**
 * Expected amounts count only base-currency events that aren't done or skipped. EMIs count in
 * full (principal + interest) since that's the cash leaving the account.
 */
export function monthTotals(events: CalendarEvent[], baseCurrency: string, actual: { income: MoneyInput; expenses: MoneyInput }): MonthTotals {
  let expectedIn = ZERO;
  let expectedOut = ZERO;
  let overdueCount = 0;
  for (const e of events) {
    if (e.status === "OVERDUE") overdueCount++;
    if (e.amount === null || e.currency !== baseCurrency) continue;
    if (e.status !== "DUE" && e.status !== "OVERDUE" && e.status !== "PROJECTED") continue;
    if (e.direction === "IN") expectedIn = expectedIn.plus(toMoney(e.amount));
    else if (e.direction === "OUT") expectedOut = expectedOut.plus(toMoney(e.amount));
  }
  return { actualIn: toMoney(actual.income), actualOut: toMoney(actual.expenses), expectedIn, expectedOut, overdueCount };
}
