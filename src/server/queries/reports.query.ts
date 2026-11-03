import "server-only";
import { format, parseISO } from "date-fns";
import { incomeExpenseTotals } from "@/domain/ledger";
import { expenseToIncomeRatio, savings, savingsRate } from "@/domain/metrics";
import { ZERO, toMoney, toMoneyString, type Money } from "@/domain/money";
import { comparablePeriods, dayToDb, daysInPeriod, dbToDay, type Day, type Period } from "@/domain/period";
import { categoryBreakdown, pctChange, type BreakdownNode, type CategoryAmount } from "@/domain/reports";
import { db } from "../db";

const s = (m: Money) => toMoneyString(m);
const pct = (m: Money | null) => (m ? m.toFixed(1) : null);

export interface BreakdownDTO {
  id: string;
  name: string;
  color: string;
  icon: string;
  amount: string;
  previous: string;
  changePct: string | null;
  sharePct: string | null;
  children: Omit<BreakdownDTO, "children">[];
}

export interface ReportDTO {
  baseCurrency: string;
  period: Period;
  /** The part of the period reported on (capped at today). */
  current: Period;
  /** Same elapsed days of the preceding period (D-018). */
  previous: Period;
  summary: {
    income: string;
    expenses: string;
    net: string;
    savingsRate: string | null;
    /** PRD §14.2: Expenses / Income × 100. */
    expenseToIncome: string | null;
    avgDailySpend: string;
    previousIncome: string;
    previousExpenses: string;
    previousNet: string;
    incomeChangePct: string | null;
    expensesChangePct: string | null;
  };
  spending: BreakdownDTO[];
  income: BreakdownDTO[];
  months: { month: string; label: string; income: string; expenses: string; net: string; savingsRate: string | null }[];
  topExpenses: { id: string; date: Day; description: string | null; category: string; account: string; amount: string }[];
  accounts: { id: string; name: string; type: string; moneyIn: string; moneyOut: string; net: string }[];
}

function leaf(n: Omit<BreakdownNode, "children">): Omit<BreakdownDTO, "children"> {
  return {
    id: n.id,
    name: n.name,
    color: n.color,
    icon: n.icon,
    amount: s(n.amount),
    previous: s(n.previous),
    changePct: pct(n.changePct),
    sharePct: pct(n.sharePct),
  };
}

const toDTO = (n: BreakdownNode): BreakdownDTO => ({ ...leaf(n), children: n.children.map(leaf) });

async function totals(userId: string, p: Period) {
  const rows = await db.transaction.groupBy({
    by: ["type", "isRefund"],
    where: { userId, type: { not: "TRANSFER" }, date: { gte: dayToDb(p.start), lte: dayToDb(p.end) } },
    _sum: { baseAmount: true },
  });
  return incomeExpenseTotals(rows.map((r) => ({ type: r.type, isRefund: r.isRefund, baseAmount: r._sum.baseAmount ?? 0 })));
}

/** Net per category for one type; refunds reduce spending. */
async function byCategory(userId: string, type: "INCOME" | "EXPENSE", p: Period): Promise<CategoryAmount[]> {
  const rows = await db.transaction.groupBy({
    by: ["categoryId", "isRefund"],
    where: { userId, type, date: { gte: dayToDb(p.start), lte: dayToDb(p.end) } },
    _sum: { baseAmount: true },
  });
  return rows
    .filter((r) => r.categoryId)
    .map((r) => {
      const amt = toMoney(r._sum.baseAmount ?? 0);
      return { categoryId: r.categoryId!, amount: r.isRefund ? amt.negated() : amt };
    });
}

export async function getReport(userId: string, baseCurrency: string, period: Period, today: Day): Promise<ReportDTO> {
  const { current, previous } = comparablePeriods(period, today);
  const range = { gte: dayToDb(current.start), lte: dayToDb(current.end) };

  const [now, before, categories, spendNow, spendBefore, incNow, incBefore, monthly, top, accountRows] = await Promise.all([
    totals(userId, current),
    totals(userId, previous),
    db.category.findMany({ where: { userId }, select: { id: true, name: true, parentId: true, color: true, icon: true } }),
    byCategory(userId, "EXPENSE", current),
    byCategory(userId, "EXPENSE", previous),
    byCategory(userId, "INCOME", current),
    byCategory(userId, "INCOME", previous),
    db.$queryRaw<{ month: string; type: "INCOME" | "EXPENSE"; isRefund: boolean; total: unknown }[]>`
      SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month, "type", "isRefund", SUM("baseAmount") AS total
      FROM "Transaction"
      WHERE "userId" = ${userId}::uuid AND "type" <> 'TRANSFER'
        AND "date" >= ${range.gte}::date AND "date" <= ${range.lte}::date
      GROUP BY 1, 2, 3 ORDER BY 1`,
    db.transaction.findMany({
      where: { userId, type: "EXPENSE", isRefund: false, date: range },
      orderBy: [{ baseAmount: "desc" }, { date: "desc" }],
      take: 10,
      select: {
        id: true,
        date: true,
        description: true,
        baseAmount: true,
        category: { select: { name: true } },
        entries: { select: { account: { select: { name: true } } }, take: 1 },
      },
    }),
    // Money in and out of each account, transfers included (base currency at entry time).
    db.$queryRaw<{ id: string; name: string; type: string; moneyIn: unknown; moneyOut: unknown }[]>`
      SELECT a."id", a."name", a."type"::text AS type,
             COALESCE(SUM(CASE WHEN e."baseAmount" > 0 THEN e."baseAmount" END), 0) AS "moneyIn",
             COALESCE(SUM(CASE WHEN e."baseAmount" < 0 THEN -e."baseAmount" END), 0) AS "moneyOut"
      FROM "LedgerEntry" e JOIN "Account" a ON a."id" = e."accountId"
      WHERE e."userId" = ${userId}::uuid AND e."date" >= ${range.gte}::date AND e."date" <= ${range.lte}::date
      GROUP BY a."id", a."name", a."type"
      ORDER BY a."name"`,
  ]);

  const byMonth = new Map<string, { income: Money; expenses: Money }>();
  for (const r of monthly) {
    const m = byMonth.get(r.month) ?? { income: ZERO, expenses: ZERO };
    const amt = toMoney(String(r.total));
    if (r.type === "INCOME") m.income = m.income.plus(amt);
    else m.expenses = r.isRefund ? m.expenses.minus(amt) : m.expenses.plus(amt);
    byMonth.set(r.month, m);
  }
  // Every month in the range, including empty ones.
  const months: ReportDTO["months"] = [];
  for (let d = parseISO(`${current.start.slice(0, 7)}-01`); format(d, "yyyy-MM") <= current.end.slice(0, 7); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const key = format(d, "yyyy-MM");
    const m = byMonth.get(key) ?? { income: ZERO, expenses: ZERO };
    months.push({
      month: key,
      label: format(d, "MMM yyyy"),
      income: s(m.income),
      expenses: s(m.expenses),
      net: s(savings(m.income, m.expenses)),
      savingsRate: pct(savingsRate(m.income, m.expenses)),
    });
  }

  return {
    baseCurrency,
    period,
    current,
    previous,
    summary: {
      income: s(now.income),
      expenses: s(now.expenses),
      net: s(savings(now.income, now.expenses)),
      savingsRate: pct(savingsRate(now.income, now.expenses)),
      expenseToIncome: pct(expenseToIncomeRatio(now.income, now.expenses)),
      avgDailySpend: s(now.expenses.div(daysInPeriod(current)).toDecimalPlaces(2)),
      previousIncome: s(before.income),
      previousExpenses: s(before.expenses),
      previousNet: s(savings(before.income, before.expenses)),
      incomeChangePct: pct(pctChange(now.income, before.income)),
      expensesChangePct: pct(pctChange(now.expenses, before.expenses)),
    },
    spending: categoryBreakdown(categories, spendNow, spendBefore).map(toDTO),
    income: categoryBreakdown(categories, incNow, incBefore).map(toDTO),
    months,
    topExpenses: top.map((t) => ({
      id: t.id,
      date: dbToDay(t.date),
      description: t.description,
      category: t.category?.name ?? "—",
      account: t.entries[0]?.account.name ?? "—",
      amount: s(toMoney(t.baseAmount)),
    })),
    accounts: accountRows.map((a) => {
      const moneyIn = toMoney(String(a.moneyIn));
      const moneyOut = toMoney(String(a.moneyOut));
      return { id: a.id, name: a.name, type: a.type, moneyIn: s(moneyIn), moneyOut: s(moneyOut), net: s(moneyIn.minus(moneyOut)) };
    }),
  };
}
