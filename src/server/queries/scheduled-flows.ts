import "server-only";
import { emiDueDates } from "@/domain/calendar";
import { pickRate, toBase } from "@/domain/fx";
import { toMoney, type Money, type MoneyInput } from "@/domain/money";
import { addDaysTo, dayToDb, dbToDay, type Day } from "@/domain/period";
import { nextOnOrAfter, occurrencesBetween, type RepeatUnit } from "@/domain/recurrence";
import { db } from "../db";
import { billSchedule } from "../services/bills.service";
import { getDebts } from "./debts.query";

export type FlowKind = "BILL" | "RECURRING" | "TRANSFER" | "EMI" | "INCOME";

export interface Flow {
  kind: FlowKind;
  title: string;
  date: Day;
  /** Base currency, signed: + money arriving in the pool, − money leaving it. */
  amount: Money;
}

export interface ScheduledFlows {
  flows: Flow[];
  /** First scheduled income after today (any income rule), if any. */
  nextIncome: Day | null;
  /** Items left out for lack of an exchange rate. */
  unconvertedCount: number;
}

/**
 * Everything scheduled to move money into or out of a pool of accounts up to `to` (D-032, D-033):
 * recurring income/expenses on pool accounts, recurring transfers crossing the pool's edge,
 * unpaid bills paid from the pool (stored occurrences, then projected past the stored horizon),
 * and loan EMIs paid from the pool. Overdue items keep their original date. Card-paid bills and
 * transfers within the pool are not flows.
 */
export async function getScheduledFlows(userId: string, baseCurrency: string, today: Day, to: Day, poolIds: Set<string>): Promise<ScheduledFlows> {
  const pool = [...poolIds];
  const [rules, occurrences, bills, debts, rateRows] = await Promise.all([
    db.recurringRule.findMany({
      where: { userId, status: "ACTIVE", nextOccurrence: { not: null } },
      select: {
        type: true,
        amount: true,
        description: true,
        accountId: true,
        toAccountId: true,
        unit: true,
        interval: true,
        startDate: true,
        endDate: true,
        nextOccurrence: true,
        category: { select: { name: true } },
      },
    }),
    db.billOccurrence.findMany({
      where: { userId, state: "PENDING", dueDate: { lte: dayToDb(to) }, bill: { paymentAccountId: { in: pool } } },
      include: { bill: { select: { name: true, paymentAccount: { select: { currency: true } } } } },
    }),
    db.bill.findMany({
      where: { userId, status: "ACTIVE", paymentAccountId: { in: pool } },
      include: { paymentAccount: { select: { currency: true } }, occurrences: { select: { dueDate: true }, orderBy: { dueDate: "desc" }, take: 1 } },
    }),
    getDebts(userId, baseCurrency, today),
    db.exchangeRate.findMany({ where: { userId }, select: { currency: true, date: true, rate: true } }),
  ]);
  const rates = rateRows.map((r) => ({ currency: r.currency, date: dbToDay(r.date), rate: r.rate }));
  let unconvertedCount = 0;
  const inBase = (amount: MoneyInput, currency: string) => {
    const v = toBase(amount, currency, baseCurrency, pickRate(rates, currency, "9999-12-31"));
    if (v === null) unconvertedCount++;
    return v;
  };

  const flows: Flow[] = [];
  const out = (kind: FlowKind, title: string, date: Day, amount: Money | null) => amount && flows.push({ kind, title, date, amount: amount.negated() });

  for (const o of occurrences) out("BILL", o.bill.name, dbToDay(o.dueDate), inBase(o.amount, o.bill.paymentAccount.currency));
  for (const b of bills) {
    const lastStored = b.occurrences[0] ? dbToDay(b.occurrences[0].dueDate) : null;
    if (!lastStored || lastStored >= to) continue;
    for (const d of occurrencesBetween(billSchedule(b), addDaysTo(lastStored, 1), to)) out("BILL", b.name, d, inBase(b.amount, b.paymentAccount.currency));
  }

  const scheduleOf = (r: (typeof rules)[number]) => ({
    start: dbToDay(r.startDate),
    end: r.endDate ? dbToDay(r.endDate) : null,
    unit: r.unit as RepeatUnit,
    interval: r.interval,
  });
  // Recurring rules are limited to base-currency accounts, so amounts are already in base.
  for (const r of rules) {
    const fromPool = poolIds.has(r.accountId);
    const toPool = r.toAccountId !== null && poolIds.has(r.toAccountId);
    let kind: FlowKind | null = null;
    let sign = 0;
    if (r.type === "INCOME" && fromPool) [kind, sign] = ["INCOME", 1];
    else if (r.type === "EXPENSE" && fromPool) [kind, sign] = ["RECURRING", -1];
    else if (r.type === "TRANSFER" && fromPool !== toPool) [kind, sign] = ["TRANSFER", toPool ? 1 : -1];
    if (!kind) continue;
    const title = r.description || r.category?.name || (kind === "INCOME" ? "Scheduled income" : kind === "TRANSFER" ? "Scheduled transfer" : "Scheduled expense");
    for (const d of occurrencesBetween(scheduleOf(r), dbToDay(r.nextOccurrence!), to)) {
      flows.push({ kind, title, date: d, amount: toMoney(r.amount).times(sign) });
    }
  }

  for (const l of debts.loans) {
    if (!l.terms || !l.nextDue || !l.remainingMonths || !poolIds.has(l.terms.paymentAccountId)) continue;
    emiDueDates(l.terms.firstPaymentDate, l.nextDue, l.remainingMonths, "0000-01-01", to).forEach((d, i) =>
      out("EMI", `${l.name} EMI`, d, inBase(i === 0 && l.suggestedPayment ? l.suggestedPayment : l.terms!.emiAmount, l.currency)),
    );
  }

  const nextIncome =
    rules
      .filter((r) => r.type === "INCOME")
      .map((r) => {
        const next = dbToDay(r.nextOccurrence!);
        return next > today ? next : nextOnOrAfter(scheduleOf(r), addDaysTo(today, 1));
      })
      .filter((d): d is Day => d !== null)
      .sort()[0] ?? null;

  flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { flows, nextIncome, unconvertedCount };
}
