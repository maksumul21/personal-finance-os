import "server-only";
import { emiDueDates } from "@/domain/calendar";
import { pickRate, toBase, type RecordedRate } from "@/domain/fx";
import { ZERO, toMoney, toMoneyString, type MoneyInput } from "@/domain/money";
import { dayToDb, dbToDay, endOfMonthDay, type Day } from "@/domain/period";
import { nextOnOrAfter, occurrencesBetween, type RepeatUnit } from "@/domain/recurrence";
import { safeToSpend, windowEnd, type Commitment, type GoalNeed } from "@/domain/safe-to-spend";
import { db } from "../db";
import { getAccountsOverview } from "./accounts.query";
import { getDebts } from "./debts.query";
import { getGoals } from "./goals.query";

export interface SafeToSpendDTO {
  today: Day;
  windowEnd: Day;
  /** True when the window ends the day before scheduled income; false = month-end fallback. */
  untilIncome: boolean;
  daysLeft: number;
  available: string;
  committed: string;
  goalSetAside: string;
  safe: string;
  perDay: string | null;
  accounts: { id: string; name: string; balance: string }[];
  commitments: { kind: Commitment["kind"]; title: string; date: Day; amount: string }[];
  goals: { title: string; amount: string }[];
  /** Included accounts or commitments left out for lack of an exchange rate. */
  unconvertedCount: number;
}

export async function getSafeToSpend(userId: string, baseCurrency: string, today: Day): Promise<SafeToSpendDTO> {
  const monthEnd = endOfMonthDay(today);
  const [overview, rules, debts, goals, rateRows] = await Promise.all([
    getAccountsOverview(userId, baseCurrency),
    db.recurringRule.findMany({
      where: { userId, status: "ACTIVE", nextOccurrence: { not: null } },
      select: { type: true, amount: true, description: true, accountId: true, toAccountId: true, unit: true, interval: true, startDate: true, endDate: true, nextOccurrence: true, category: { select: { name: true } } },
    }),
    getDebts(userId, baseCurrency, today),
    getGoals(userId, today),
    db.exchangeRate.findMany({ where: { userId }, select: { currency: true, date: true, rate: true } }),
  ]);
  const rates: RecordedRate[] = rateRows.map((r) => ({ currency: r.currency, date: dbToDay(r.date), rate: r.rate }));
  let unconvertedCount = 0;
  const inBase = (amount: MoneyInput, currency: string) => {
    const v = toBase(amount, currency, baseCurrency, pickRate(rates, currency, "9999-12-31"));
    if (v === null) unconvertedCount++;
    return v;
  };

  // Spendable money: active asset accounts the user marked, never investment accounts.
  const eligible = overview.accounts.filter((a) => !a.isArchived && a.includeInSafeToSpend && a.nature === "ASSET" && a.type !== "INVESTMENT");
  const included = eligible.filter((a) => a.baseBalance !== null);
  unconvertedCount += eligible.length - included.length;
  const includedIds = new Set(included.map((a) => a.id));

  // Next scheduled income (any active income rule), on or after today.
  const scheduleOf = (r: (typeof rules)[number]) => ({
    start: dbToDay(r.startDate),
    end: r.endDate ? dbToDay(r.endDate) : null,
    unit: r.unit as RepeatUnit,
    interval: r.interval,
  });
  const incomeDates = rules
    .filter((r) => r.type === "INCOME")
    .map((r) => {
      const next = dbToDay(r.nextOccurrence!);
      return next >= today ? next : nextOnOrAfter(scheduleOf(r), today);
    })
    .filter((d): d is Day => d !== null)
    .sort();
  // Income due today doesn't count as the next one; take the first after today.
  const nextIncome = incomeDates.find((d) => d > today) ?? null;
  const end = windowEnd(today, monthEnd, nextIncome);

  const commitments: Commitment[] = [];

  // Unpaid bills paid from a spendable account (card-paid bills don't touch cash yet).
  const occurrences = await db.billOccurrence.findMany({
    where: { userId, state: "PENDING", dueDate: { lte: dayToDb(end) }, bill: { paymentAccountId: { in: [...includedIds] } } },
    include: { bill: { select: { name: true, paymentAccount: { select: { currency: true } } } } },
  });
  for (const o of occurrences) {
    const amount = inBase(o.amount, o.bill.paymentAccount.currency);
    if (amount) commitments.push({ kind: "BILL", title: o.bill.name, date: dbToDay(o.dueDate), amount });
  }

  // Scheduled expenses from, and transfers out of, spendable accounts (recurring is base currency only).
  for (const r of rules) {
    if (!includedIds.has(r.accountId)) continue;
    const isExpense = r.type === "EXPENSE";
    const leavesPool = r.type === "TRANSFER" && r.toAccountId !== null && !includedIds.has(r.toAccountId);
    if (!isExpense && !leavesPool) continue;
    for (const d of occurrencesBetween(scheduleOf(r), dbToDay(r.nextOccurrence!), end)) {
      commitments.push({
        kind: isExpense ? "RECURRING" : "TRANSFER",
        title: r.description || r.category?.name || (isExpense ? "Scheduled expense" : "Scheduled transfer"),
        date: d,
        amount: r.amount.toString(),
      });
    }
  }

  // Loan instalments paid from a spendable account, including any overdue one.
  for (const l of debts.loans) {
    if (!l.terms || !l.nextDue || !l.remainingMonths || !includedIds.has(l.terms.paymentAccountId)) continue;
    emiDueDates(l.terms.firstPaymentDate, l.nextDue, l.remainingMonths, "0000-01-01", end).forEach((d, i) => {
      const amount = inBase(i === 0 && l.suggestedPayment ? l.suggestedPayment : l.terms!.emiAmount, l.currency);
      if (amount) commitments.push({ kind: "EMI", title: `${l.name} EMI`, date: d, amount });
    });
  }

  // Goals: what's still needed this month to stay on pace (net deposits so far count).
  const monthStart = `${today.slice(0, 7)}-01`;
  const goalNeeds: GoalNeed[] = goals
    .filter((g) => g.status === "ACTIVE" && g.requiredMonthly && toMoney(g.requiredMonthly).greaterThan(0))
    .map((g) => {
      let saved = ZERO;
      for (const c of g.contributions) {
        if (c.date < monthStart || c.date > today) continue;
        saved = c.direction === "DEPOSIT" ? saved.plus(toMoney(c.amount)) : saved.minus(toMoney(c.amount));
      }
      return { title: g.name, requiredMonthly: g.requiredMonthly!, savedThisMonth: saved };
    });

  const r = safeToSpend({ today, monthEnd, nextIncome, balances: included.map((a) => a.baseBalance!), commitments, goals: goalNeeds });
  return {
    today,
    windowEnd: r.windowEnd,
    untilIncome: nextIncome !== null,
    daysLeft: r.daysLeft,
    available: toMoneyString(r.available),
    committed: toMoneyString(r.committed),
    goalSetAside: toMoneyString(r.goalSetAside),
    safe: toMoneyString(r.safe),
    perDay: r.perDay ? toMoneyString(r.perDay) : null,
    accounts: included.map((a) => ({ id: a.id, name: a.name, balance: a.baseBalance! })),
    commitments: r.commitments.map((c) => ({ kind: c.kind, title: c.title, date: c.date, amount: toMoneyString(c.amount) })),
    goals: r.goals.map((g) => ({ title: g.title, amount: toMoneyString(g.amount) })),
    unconvertedCount,
  };
}
