import "server-only";
import { billStatus } from "@/domain/bills";
import { emiDueDates, monthGrid, monthTotals, type CalendarEvent, type MonthTotals } from "@/domain/calendar";
import { incomeExpenseTotals } from "@/domain/ledger";
import { ZERO, toMoney, toMoneyString, type Money } from "@/domain/money";
import { addDaysTo, dayToDb, dbToDay, endOfMonthDay, type Day } from "@/domain/period";
import { occurrencesBetween, type RepeatUnit } from "@/domain/recurrence";
import { db } from "../db";
import { billSchedule } from "../services/bills.service";
import { getDebts } from "./debts.query";
import { getGoals } from "./goals.query";

export interface DayActual {
  income: string;
  expenses: string;
}

export interface CalendarDTO {
  month: string;
  today: Day;
  baseCurrency: string;
  weeks: { date: Day; inMonth: boolean }[][];
  events: CalendarEvent[];
  /** Recorded income and spending per day (base currency, transfers excluded). */
  actuals: Record<Day, DayActual>;
  totals: { [K in keyof MonthTotals]: K extends "overdueCount" ? number : string };
}

const order: Record<CalendarEvent["status"], number> = { OVERDUE: 0, DUE: 1, PROJECTED: 2, TARGET: 3, DONE: 4, SKIPPED: 5 };

export async function getCalendar(userId: string, baseCurrency: string, month: string, today: Day, weekStartsOn: number): Promise<CalendarDTO> {
  const from: Day = `${month}-01`;
  const to = endOfMonthDay(from);
  const range = { gte: dayToDb(from), lte: dayToDb(to) };

  const [occurrences, bills, rules, debts, goals, txRows, daily] = await Promise.all([
    db.billOccurrence.findMany({
      where: { userId, dueDate: range },
      include: { bill: { select: { name: true, paymentAccount: { select: { currency: true } } } } },
    }),
    db.bill.findMany({
      where: { userId, status: "ACTIVE" },
      include: { paymentAccount: { select: { currency: true } }, occurrences: { select: { dueDate: true }, orderBy: { dueDate: "desc" }, take: 1 } },
    }),
    db.recurringRule.findMany({
      where: { userId, status: "ACTIVE", nextOccurrence: { not: null, lte: dayToDb(to) } },
      include: { account: { select: { currency: true, name: true } }, category: { select: { name: true } }, toAccount: { select: { name: true } } },
    }),
    getDebts(userId, baseCurrency, today),
    getGoals(userId, today),
    db.transaction.groupBy({
      by: ["type", "isRefund"],
      where: { userId, type: { not: "TRANSFER" }, date: range },
      _sum: { baseAmount: true },
    }),
    db.transaction.groupBy({
      by: ["date", "type", "isRefund"],
      where: { userId, type: { not: "TRANSFER" }, date: range },
      _sum: { baseAmount: true },
    }),
  ]);

  const events: CalendarEvent[] = [];
  const billHref = `/bills?month=${month}`;

  // Bills: stored occurrences, then projections past the stored horizon.
  for (const o of occurrences) {
    const due = dbToDay(o.dueDate);
    const s = billStatus(o.state, due, today);
    events.push({
      id: `bill-${o.id}`,
      date: due,
      kind: "BILL",
      title: o.bill.name,
      amount: toMoneyString(o.amount),
      currency: o.bill.paymentAccount.currency,
      direction: "OUT",
      status: s === "PAID" ? "DONE" : s === "SKIPPED" ? "SKIPPED" : s === "OVERDUE" ? "OVERDUE" : "DUE",
      href: billHref,
    });
  }
  for (const b of bills) {
    const lastStored = b.occurrences[0] ? dbToDay(b.occurrences[0].dueDate) : null;
    const start = lastStored && addDaysTo(lastStored, 1) > from ? addDaysTo(lastStored, 1) : from;
    for (const d of occurrencesBetween(billSchedule(b), start, to)) {
      events.push({
        id: `bill-${b.id}-${d}`,
        date: d,
        kind: "BILL",
        title: b.name,
        amount: toMoneyString(b.amount),
        currency: b.paymentAccount.currency,
        direction: "OUT",
        status: "PROJECTED",
        href: billHref,
      });
    }
  }

  // Recurring: occurrences not yet posted (posted ones are transactions, in the daily actuals).
  for (const r of rules) {
    const next = dbToDay(r.nextOccurrence!);
    const schedule = { start: dbToDay(r.startDate), end: r.endDate ? dbToDay(r.endDate) : null, unit: r.unit as RepeatUnit, interval: r.interval };
    for (const d of occurrencesBetween(schedule, next > from ? next : from, to)) {
      const title =
        r.description ||
        (r.type === "TRANSFER" ? `${r.account.name} → ${r.toAccount?.name ?? "account"}` : (r.category?.name ?? "Recurring"));
      events.push({
        id: `rec-${r.id}-${d}`,
        date: d,
        kind: "RECURRING",
        title,
        amount: toMoneyString(r.amount),
        currency: r.account.currency,
        direction: r.type === "INCOME" ? "IN" : r.type === "EXPENSE" ? "OUT" : "MOVE",
        status: "PROJECTED",
        href: "/transactions/recurring",
      });
    }
  }

  // Loan EMIs: recorded payments, then remaining due dates up to payoff.
  for (const l of debts.loans) {
    if (!l.terms) continue;
    for (const p of l.payments) {
      if (p.date < from || p.date > to) continue;
      events.push({ id: `emi-${p.id}`, date: p.date, kind: "EMI", title: `${l.name} EMI`, amount: p.total, currency: l.currency, direction: "OUT", status: "DONE", href: "/debts" });
    }
    if (l.nextDue && l.remainingMonths) {
      emiDueDates(l.terms.firstPaymentDate, l.nextDue, l.remainingMonths, from, to).forEach((d, i) => {
        events.push({
          id: `emi-${l.accountId}-${d}`,
          date: d,
          kind: "EMI",
          title: `${l.name} EMI`,
          amount: i === 0 && d === l.nextDue && l.suggestedPayment ? l.suggestedPayment : l.terms!.emiAmount,
          currency: l.currency,
          direction: "OUT",
          status: d < today ? "OVERDUE" : "DUE",
          href: "/debts",
        });
      });
    }
  }

  // Goal target dates.
  for (const g of goals) {
    if (g.status !== "ACTIVE" || !g.targetDate || g.targetDate < from || g.targetDate > to) continue;
    events.push({
      id: `goal-${g.id}`,
      date: g.targetDate,
      kind: "GOAL",
      title: `${g.name} target`,
      amount: g.remaining,
      currency: baseCurrency,
      direction: null,
      status: "TARGET",
      href: "/goals",
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order[a.status] - order[b.status] || a.title.localeCompare(b.title)));

  const actuals: Record<Day, DayActual> = {};
  const perDay = new Map<Day, { income: Money; expenses: Money }>();
  for (const r of daily) {
    const d = dbToDay(r.date);
    const cur = perDay.get(d) ?? { income: ZERO, expenses: ZERO };
    const amt = toMoney(r._sum.baseAmount ?? 0);
    if (r.type === "INCOME") cur.income = cur.income.plus(amt);
    else cur.expenses = r.isRefund ? cur.expenses.minus(amt) : cur.expenses.plus(amt);
    perDay.set(d, cur);
  }
  for (const [d, v] of perDay) actuals[d] = { income: toMoneyString(v.income), expenses: toMoneyString(v.expenses) };

  const actual = incomeExpenseTotals(txRows.map((r) => ({ type: r.type, isRefund: r.isRefund, baseAmount: r._sum.baseAmount ?? 0 })));
  const t = monthTotals(events, baseCurrency, actual);
  const grid = monthGrid(month, weekStartsOn);

  return {
    month,
    today,
    baseCurrency,
    weeks: Array.from({ length: grid.length / 7 }, (_, i) => grid.slice(i * 7, i * 7 + 7)),
    events,
    actuals,
    totals: {
      actualIn: toMoneyString(t.actualIn),
      actualOut: toMoneyString(t.actualOut),
      expectedIn: toMoneyString(t.expectedIn),
      expectedOut: toMoneyString(t.expectedOut),
      overdueCount: t.overdueCount,
    },
  };
}
