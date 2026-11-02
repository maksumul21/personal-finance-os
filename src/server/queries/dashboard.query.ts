import "server-only";
import { format, parseISO } from "date-fns";
import { isMarkedToMarket } from "@/domain/accounts";
import type { Thresholds } from "@/domain/budget";
import { pickRate, toBase } from "@/domain/fx";
import { buildInsights, type Insight } from "@/domain/insights";
import { incomeExpenseTotals } from "@/domain/ledger";
import { savings, savingsRate } from "@/domain/metrics";
import { ZERO, sum, toMoney, toMoneyString, type Money } from "@/domain/money";
import {
  addDaysTo,
  comparablePeriods,
  dayToDb,
  dbToDay,
  endOfMonthDay,
  monthsEnding,
  type Day,
  type Period,
} from "@/domain/period";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { db } from "../db";
import { getAccountsOverview } from "./accounts.query";
import { getUpcomingBills, type OccurrenceDTO } from "./bills.query";
import { getActiveBudget, type BudgetDetailDTO } from "./budgets.query";
import { getGoals } from "./goals.query";
import { getRecentTransactions, type TransactionDTO } from "./transactions.query";

export interface MonthPoint {
  month: string; // yyyy-MM
  label: string; // "Nov 26"
  income: string;
  expenses: string;
  net: string;
  cumulativeSavings: string;
  netWorth: string | null;
}

export interface BreakdownSlice {
  categoryId: string;
  name: string;
  amount: string;
  pct: string;
  /** Categorical chart slot 1–8 assigned by the group's position, so colour follows the category. */
  slot: number;
}

export interface DashboardDTO {
  period: Period;
  periodLabel: string;
  baseCurrency: string;
  kpis: {
    totalBalance: string;
    liabilities: string;
    netWorth: string;
    unconvertedCount: number;
    income: string;
    expenses: string;
    savings: string;
    savingsRate: string | null;
    remainingBudget: string | null;
    previousIncome: string;
    previousExpenses: string;
    comparisonLabel: string;
  };
  months: MonthPoint[];
  breakdown: BreakdownSlice[];
  budget: BudgetDetailDTO | null;
  recent: TransactionDTO[];
  /** PRD §4.4: overdue and due in the next 30 days. */
  upcomingBills: { items: OccurrenceDTO[]; total: string | null };
  insights: Insight[];
}

function rangeLabel(p: Period) {
  const s = parseISO(p.start);
  const e = parseISO(p.end);
  if (p.start === p.end) return format(s, "d MMM yyyy");
  if (s.getFullYear() === e.getFullYear()) {
    return s.getMonth() === e.getMonth()
      ? `${format(s, "d")}–${format(e, "d MMM yyyy")}`
      : `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
  }
  return `${format(s, "d MMM yyyy")} – ${format(e, "d MMM yyyy")}`;
}

async function totalsIn(userId: string, p: Period) {
  const rows = await db.transaction.groupBy({
    by: ["type", "isRefund"],
    where: { userId, type: { not: "TRANSFER" }, date: { gte: dayToDb(p.start), lte: dayToDb(p.end) } },
    _sum: { baseAmount: true },
  });
  return incomeExpenseTotals(rows.map((r) => ({ type: r.type, isRefund: r.isRefund, baseAmount: r._sum.baseAmount ?? 0 })));
}

/** Income/expense per month, aggregated in SQL. */
async function monthlyTotals(userId: string, from: Day, to: Day) {
  const rows = await db.$queryRaw<{ month: string; type: "INCOME" | "EXPENSE"; isRefund: boolean; total: unknown }[]>`
    SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, "type", "isRefund", SUM("baseAmount") AS total
    FROM "Transaction"
    WHERE "userId" = ${userId}::uuid AND "type" <> 'TRANSFER'
      AND "date" >= ${dayToDb(from)}::date AND "date" <= ${dayToDb(to)}::date
    GROUP BY 1, 2, 3`;
  const map = new Map<string, { income: Money; expenses: Money }>();
  for (const r of rows) {
    const m = map.get(r.month) ?? { income: ZERO, expenses: ZERO };
    const amt = toMoney(String(r.total));
    if (r.type === "INCOME") m.income = m.income.plus(amt);
    else m.expenses = r.isRefund ? m.expenses.minus(amt) : m.expenses.plus(amt);
    map.set(r.month, m);
  }
  return map;
}

/**
 * Month-end net worth from accounts (assets − liabilities), excluding investment containers.
 * Opening balances count from their opening date; foreign ones convert at the latest recorded
 * rate. Investments and manual assets join this series in Phase 4.
 */
async function netWorthByMonth(userId: string, baseCurrency: string, months: string[]) {
  const lastDay = endOfMonthDay(`${months.at(-1)}-01`);
  const [accounts, entries, rates] = await Promise.all([
    db.account.findMany({ where: { userId }, select: { type: true, currency: true, openingBalance: true, openingDate: true } }),
    db.$queryRaw<{ month: string; total: unknown }[]>`
      SELECT to_char(date_trunc('month', e."date"), 'YYYY-MM') AS month, SUM(e."baseAmount") AS total
      FROM "LedgerEntry" e JOIN "Account" a ON a."id" = e."accountId"
      WHERE e."userId" = ${userId}::uuid AND a."type" <> 'INVESTMENT' AND e."date" <= ${dayToDb(lastDay)}::date
      GROUP BY 1 ORDER BY 1`,
    db.exchangeRate.findMany({ where: { userId }, select: { currency: true, date: true, rate: true } }),
  ]);
  const recorded = rates.map((r) => ({ currency: r.currency, date: dbToDay(r.date), rate: r.rate }));

  return months.map((m) => {
    const end = endOfMonthDay(`${m}-01`);
    let total = ZERO;
    for (const a of accounts) {
      if (isMarkedToMarket(a.type) || dbToDay(a.openingDate) > end) continue;
      const base = toBase(a.openingBalance, a.currency, baseCurrency, pickRate(recorded, a.currency, "9999-12-31"));
      if (base === null) return null; // can't value this month honestly
      total = total.plus(base);
    }
    for (const e of entries) if (e.month <= m) total = total.plus(toMoney(String(e.total)));
    return total;
  });
}

/** Expense spending per top-level group in the period. */
async function breakdown(userId: string, p: Period): Promise<BreakdownSlice[]> {
  const [rows, categories] = await Promise.all([
    db.transaction.groupBy({
      by: ["categoryId", "isRefund"],
      where: { userId, type: "EXPENSE", date: { gte: dayToDb(p.start), lte: dayToDb(p.end) } },
      _sum: { baseAmount: true },
    }),
    db.category.findMany({
      where: { userId, kind: "EXPENSE" },
      select: { id: true, name: true, parentId: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = categories.filter((c) => !c.parentId);
  const totals = new Map<string, Money>();
  for (const r of rows) {
    const c = r.categoryId ? byId.get(r.categoryId) : undefined;
    if (!c) continue;
    const groupId = c.parentId ?? c.id;
    const amt = toMoney(r._sum.baseAmount ?? 0);
    totals.set(groupId, (totals.get(groupId) ?? ZERO).plus(r.isRefund ? amt.negated() : amt));
  }
  const total = [...totals.values()].reduce((a, b) => a.plus(b), ZERO);
  if (!total.greaterThan(0)) return [];

  // Slot = the group's position among expense groups (1–7); groups beyond 7 fold into "Other" (8).
  const slices = groups
    .map((g, i) => ({ g, i, amount: totals.get(g.id) ?? ZERO }))
    .filter((x) => x.amount.greaterThan(0));
  const main = slices.filter((x) => x.i < 7);
  const other = slices.filter((x) => x.i >= 7).reduce((a, x) => a.plus(x.amount), ZERO);
  const out: BreakdownSlice[] = main.map((x) => ({
    categoryId: x.g.id,
    name: x.g.name,
    amount: toMoneyString(x.amount),
    pct: x.amount.div(total).times(100).toFixed(1),
    slot: x.i + 1,
  }));
  if (other.greaterThan(0)) {
    out.push({ categoryId: "other", name: "Other", amount: toMoneyString(other), pct: other.div(total).times(100).toFixed(1), slot: 8 });
  }
  return out.sort((a, b) => toMoney(b.amount).comparedTo(toMoney(a.amount)));
}

export async function getDashboard(opts: {
  userId: string;
  baseCurrency: string;
  today: Day;
  period: Period;
  trendMonths: number;
  thresholds: Thresholds;
  pref: NumberFormatPref;
}): Promise<DashboardDTO> {
  const { userId, baseCurrency, today, period } = opts;
  const { current, previous } = comparablePeriods(period, today);
  const months = monthsEnding(period.end < today ? period.end : today, opts.trendMonths);
  const trendFrom = `${months[0]}-01`;
  const trendTo = endOfMonthDay(`${months.at(-1)}-01`);

  const [accounts, now, prev, monthly, netWorth, slices, budget, recent, bills, goals] = await Promise.all([
    getAccountsOverview(userId, baseCurrency),
    totalsIn(userId, period),
    totalsIn(userId, previous),
    monthlyTotals(userId, trendFrom, trendTo),
    netWorthByMonth(userId, baseCurrency, months),
    breakdown(userId, period),
    getActiveBudget(userId, today, opts.thresholds),
    getRecentTransactions(userId, 8),
    getUpcomingBills(userId, today, 30),
    getGoals(userId, today),
  ]);
  const weekAhead = addDaysTo(today, 7);
  const dueSoon = bills.items.filter((b) => b.status !== "OVERDUE" && b.dueDate <= weekAhead);
  const ef = goals.find((g) => g.goalType === "EMERGENCY_FUND" && g.status === "ACTIVE");
  // Same-days comparison uses the elapsed part of the current period.
  const nowComparable = current.end === period.end ? now : await totalsIn(userId, current);

  let cumulative = ZERO;
  const points: MonthPoint[] = months.map((m, i) => {
    const t = monthly.get(m) ?? { income: ZERO, expenses: ZERO };
    const net = t.income.minus(t.expenses);
    cumulative = cumulative.plus(net);
    return {
      month: m,
      label: format(parseISO(`${m}-01`), "MMM yy"),
      income: toMoneyString(t.income),
      expenses: toMoneyString(t.expenses),
      net: toMoneyString(net),
      cumulativeSavings: toMoneyString(cumulative),
      netWorth: netWorth[i] ? toMoneyString(netWorth[i]!) : null,
    };
  });

  const rate = savingsRate(now.income, now.expenses);
  const netWorthNow = toMoney(accounts.totals.totalBalance).minus(toMoney(accounts.totals.totalLiabilities));
  const fmt = (v: string) => formatMoney(v, baseCurrency, { pref: opts.pref, compactDecimals: true });

  const insights = buildInsights({
    periodLabel: rangeLabel(current),
    previousLabel: rangeLabel(previous),
    income: nowComparable.income,
    expenses: nowComparable.expenses,
    previousIncome: prev.income,
    previousExpenses: prev.expenses,
    categorySpending: slices.filter((s) => s.categoryId !== "other").map((s) => ({ name: s.name, amount: s.amount })),
    budgetLines: (budget?.lines ?? [])
      .filter((l) => l.kind === "EXPENSE_CATEGORY")
      .map((l) => ({ name: l.name, usagePct: l.usagePct ? toMoney(l.usagePct) : null, state: l.state! })),
    bills: {
      overdueCount: bills.overdueCount,
      dueSoonCount: dueSoon.length,
      dueSoonTotal: dueSoon.length && dueSoon.every((b) => b.currency === baseCurrency) ? toMoneyString(sum(dueSoon.map((b) => b.amount))) : null,
    },
    emergencyFund: ef ? { saved: ef.saved, target: ef.target, monthsCovered: ef.monthsCovered, targetMonths: ef.targetMonths } : undefined,
    formatMoney: fmt,
  });

  return {
    period,
    periodLabel: rangeLabel(period),
    baseCurrency,
    kpis: {
      totalBalance: accounts.totals.totalBalance,
      liabilities: accounts.totals.totalLiabilities,
      netWorth: toMoneyString(netWorthNow),
      unconvertedCount: accounts.totals.unconvertedCount,
      income: toMoneyString(now.income),
      expenses: toMoneyString(now.expenses),
      savings: toMoneyString(savings(now.income, now.expenses)),
      savingsRate: rate ? rate.toFixed(1) : null,
      remainingBudget: budget ? budget.totals.remaining : null,
      previousIncome: toMoneyString(prev.income),
      previousExpenses: toMoneyString(prev.expenses),
      comparisonLabel: rangeLabel(previous),
    },
    months: points,
    breakdown: slices,
    budget,
    recent,
    upcomingBills: { items: bills.items.slice(0, 6), total: bills.total },
    insights,
  };
}
