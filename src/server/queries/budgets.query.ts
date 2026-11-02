import "server-only";
import {
  budgetLine,
  previousPeriod,
  rolloverAmount,
  templateBuckets,
  zeroBased,
  type Bucket,
  type BucketPlan,
  type Thresholds,
  type UsageState,
} from "@/domain/budget";
import { ZERO, sum, toMoney, toMoneyString, type Money } from "@/domain/money";
import { addDaysTo, dayToDb, dbToDay, type Day, type Period } from "@/domain/period";
import type { AllocationKind, BudgetIncomeSource, BudgetMethod, BudgetPeriodType } from "@/generated/prisma/client";
import { db } from "../db";

/** Max previous periods followed when accumulating rollover. */
const ROLLOVER_DEPTH = 12;

/**
 * Expense spending per category in a period, base currency, refunds subtracted.
 * Keyed by category id; the caller rolls subcategories into groups.
 */
async function spendingByCategory(userId: string, period: Period): Promise<Map<string, Money>> {
  const rows = await db.transaction.groupBy({
    by: ["categoryId", "isRefund"],
    where: { userId, type: "EXPENSE", date: { gte: dayToDb(period.start), lte: dayToDb(period.end) } },
    _sum: { baseAmount: true },
  });
  const map = new Map<string, Money>();
  for (const r of rows) {
    if (!r.categoryId) continue;
    const amt = toMoney(r._sum.baseAmount ?? 0);
    map.set(r.categoryId, (map.get(r.categoryId) ?? ZERO).plus(r.isRefund ? amt.negated() : amt));
  }
  return map;
}

async function incomeIn(userId: string, period: Period): Promise<Money> {
  const r = await db.transaction.aggregate({
    where: { userId, type: "INCOME", date: { gte: dayToDb(period.start), lte: dayToDb(period.end) } },
    _sum: { baseAmount: true },
  });
  return toMoney(r._sum.baseAmount ?? 0);
}

interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
  isEssential: boolean;
}

/** Spending for a budget line's category: a group includes its subcategories. */
function lineSpending(categoryId: string, categories: CategoryInfo[], spending: Map<string, Money>): Money {
  const ids = [categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)];
  return sum(ids.map((id) => spending.get(id) ?? ZERO));
}

export interface BudgetLineDTO {
  id: string;
  kind: AllocationKind;
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  isEssential: boolean;
  rolloverEnabled: boolean;
  allocated: string;
  carry: string;
  available: string;
  /** EXPENSE_CATEGORY only. */
  spent: string | null;
  remaining: string | null;
  usagePct: string | null;
  state: UsageState | null;
  /** Spending in the previous period of the same length, for comparison. */
  previousSpent: string | null;
}

export interface BudgetDetailDTO {
  id: string;
  name: string;
  periodType: BudgetPeriodType;
  method: BudgetMethod;
  start: Day;
  end: Day;
  previous: Period;
  incomeSource: BudgetIncomeSource;
  plannedIncome: string | null;
  actualIncome: string;
  availableIncome: string;
  lines: BudgetLineDTO[];
  totals: {
    /** Expense-category allocations (+ rollover). */
    expenseBudget: string;
    spent: string;
    /** PRD §4.1 Remaining Budget = allocated − actual budgeted expenses. */
    remaining: string;
    usagePct: string | null;
    state: UsageState;
    /** Spending in categories this budget doesn't cover. */
    unbudgeted: string;
    previousSpent: string;
  };
  zeroBased: { totalAllocated: string; unallocated: string; status: "complete" | "unallocated" | "over-allocated" };
  buckets: { bucket: Bucket; targetPct: number; target: string; planned: string; difference: string }[] | null;
}

type BudgetRow = NonNullable<Awaited<ReturnType<typeof loadBudget>>>;

function loadBudget(userId: string, where: { id: string } | { periodType: BudgetPeriodType; endDate: Date }) {
  return db.budget.findFirst({
    where: { userId, ...where },
    include: { allocations: { orderBy: [{ sortOrder: "asc" }] } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Carry for one category line: walks back through consecutive budgets of the same period type
 * that also budget this category with rollover on, oldest first.
 */
async function carryFor(userId: string, budget: BudgetRow, categoryId: string, categories: CategoryInfo[]): Promise<Money> {
  const chain: { allocated: Money; period: Period }[] = [];
  let cursor = budget;
  for (let i = 0; i < ROLLOVER_DEPTH; i++) {
    const prevEnd = dayToDb(addDaysTo(dbToDay(cursor.startDate), -1));
    const prev = await loadBudget(userId, { periodType: cursor.periodType, endDate: prevEnd });
    const line = prev?.allocations.find((a) => a.categoryId === categoryId && a.rolloverEnabled);
    if (!prev || !line) break;
    chain.unshift({ allocated: toMoney(line.allocatedAmount), period: { start: dbToDay(prev.startDate), end: dbToDay(prev.endDate) } });
    cursor = prev;
  }
  let carry = ZERO;
  for (const link of chain) {
    const spent = lineSpending(categoryId, categories, await spendingByCategory(userId, link.period));
    carry = rolloverAmount({ allocated: link.allocated, spent, carry });
  }
  return carry;
}

export async function getBudgetDetail(userId: string, budgetId: string, thresholds: Thresholds): Promise<BudgetDetailDTO | null> {
  const budget = await loadBudget(userId, { id: budgetId });
  if (!budget) return null;
  const period: Period = { start: dbToDay(budget.startDate), end: dbToDay(budget.endDate) };
  const previous = previousPeriod(budget.periodType, period);

  const [categories, spending, prevSpending, actualIncome] = await Promise.all([
    db.category.findMany({
      where: { userId, kind: "EXPENSE" },
      select: { id: true, name: true, icon: true, color: true, parentId: true, isEssential: true },
    }),
    spendingByCategory(userId, period),
    spendingByCategory(userId, previous),
    incomeIn(userId, period),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const lines: BudgetLineDTO[] = [];
  const covered = new Set<string>();
  for (const a of budget.allocations) {
    if (a.kind === "EXPENSE_CATEGORY" && a.categoryId) {
      const cat = byId.get(a.categoryId);
      const carry = a.rolloverEnabled ? await carryFor(userId, budget, a.categoryId, categories) : ZERO;
      const spent = lineSpending(a.categoryId, categories, spending);
      const r = budgetLine({ allocated: a.allocatedAmount, spent, carry }, thresholds);
      covered.add(a.categoryId);
      for (const c of categories) if (c.parentId === a.categoryId) covered.add(c.id);
      lines.push({
        id: a.id,
        kind: a.kind,
        categoryId: a.categoryId,
        name: cat?.name ?? "Category",
        icon: cat?.icon ?? "tag",
        color: cat?.color ?? "#64748b",
        isEssential: cat ? (cat.isEssential || Boolean(cat.parentId && byId.get(cat.parentId)?.isEssential)) : false,
        rolloverEnabled: a.rolloverEnabled,
        allocated: toMoneyString(r.allocated),
        carry: toMoneyString(r.carry),
        available: toMoneyString(r.available),
        spent: toMoneyString(r.spent),
        remaining: toMoneyString(r.remaining),
        usagePct: r.usagePct ? r.usagePct.toFixed(1) : null,
        state: r.state,
        previousSpent: toMoneyString(lineSpending(a.categoryId, categories, prevSpending)),
      });
    } else {
      lines.push({
        id: a.id,
        kind: a.kind,
        categoryId: null,
        name: a.label ?? "Planned",
        icon: a.kind === "SAVINGS" ? "piggy-bank" : a.kind === "INVESTMENT" ? "trending-up" : "hand-coins",
        color: "#64748b",
        isEssential: false,
        rolloverEnabled: false,
        allocated: toMoneyString(a.allocatedAmount),
        carry: "0.00",
        available: toMoneyString(a.allocatedAmount),
        spent: null,
        remaining: null,
        usagePct: null,
        state: null,
        previousSpent: null,
      });
    }
  }

  const expenseLines = lines.filter((l) => l.kind === "EXPENSE_CATEGORY");
  const expenseBudget = sum(expenseLines.map((l) => l.available));
  const spent = sum(expenseLines.map((l) => l.spent!));
  const totalLine = budgetLine({ allocated: expenseBudget, spent }, thresholds);
  const unbudgeted = sum([...spending.entries()].filter(([id]) => !covered.has(id)).map(([, v]) => v));

  const availableIncome =
    budget.incomeSource === "PLANNED" && budget.plannedIncome ? toMoney(budget.plannedIncome) : actualIncome;
  const zb = zeroBased(availableIncome, lines.map((l) => l.allocated));

  const planned: Record<Bucket, Money> = {
    needs: sum(expenseLines.filter((l) => l.isEssential).map((l) => l.allocated)),
    wants: sum(expenseLines.filter((l) => !l.isEssential).map((l) => l.allocated)),
    living: sum(expenseLines.map((l) => l.allocated)),
    savings: sum(lines.filter((l) => l.kind === "SAVINGS" || l.kind === "INVESTMENT").map((l) => l.allocated)),
    debt: sum(lines.filter((l) => l.kind === "DEBT_REPAYMENT").map((l) => l.allocated)),
  };
  const buckets: BucketPlan[] | null = templateBuckets(budget.method, availableIncome, planned);

  return {
    id: budget.id,
    name: budget.name,
    periodType: budget.periodType,
    method: budget.method,
    start: period.start,
    end: period.end,
    previous,
    incomeSource: budget.incomeSource,
    plannedIncome: budget.plannedIncome ? toMoneyString(budget.plannedIncome) : null,
    actualIncome: toMoneyString(actualIncome),
    availableIncome: toMoneyString(availableIncome),
    lines,
    totals: {
      expenseBudget: toMoneyString(expenseBudget),
      spent: toMoneyString(spent),
      remaining: toMoneyString(totalLine.remaining),
      usagePct: totalLine.usagePct ? totalLine.usagePct.toFixed(1) : null,
      state: totalLine.state,
      unbudgeted: toMoneyString(unbudgeted),
      previousSpent: toMoneyString(sum(expenseLines.map((l) => l.previousSpent!))),
    },
    zeroBased: { totalAllocated: toMoneyString(zb.totalAllocated), unallocated: toMoneyString(zb.unallocated), status: zb.status },
    buckets: buckets?.map((b) => ({
      bucket: b.bucket,
      targetPct: b.targetPct,
      target: toMoneyString(b.target),
      planned: toMoneyString(b.planned),
      difference: toMoneyString(b.difference),
    })) ?? null,
  };
}

export interface BudgetListItem {
  id: string;
  name: string;
  periodType: BudgetPeriodType;
  method: BudgetMethod;
  start: Day;
  end: Day;
  isCurrent: boolean;
  expenseBudget: string;
  spent: string;
  usagePct: string | null;
  state: UsageState;
}

export async function listBudgets(userId: string, today: Day, thresholds: Thresholds): Promise<BudgetListItem[]> {
  const budgets = await db.budget.findMany({
    where: { userId },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  const details = await Promise.all(budgets.map((b) => getBudgetDetail(userId, b.id, thresholds)));
  return details
    .filter((d): d is BudgetDetailDTO => d !== null)
    .map((d) => ({
      id: d.id,
      name: d.name,
      periodType: d.periodType,
      method: d.method,
      start: d.start,
      end: d.end,
      isCurrent: d.start <= today && today <= d.end,
      expenseBudget: d.totals.expenseBudget,
      spent: d.totals.spent,
      usagePct: d.totals.usagePct,
      state: d.totals.state,
    }));
}

/** Preference when several budgets cover today: the monthly plan is what the dashboard tracks. */
const ACTIVE_PREFERENCE: BudgetPeriodType[] = ["MONTHLY", "CUSTOM", "WEEKLY", "ANNUAL"];

/** The budget covering today; by period type preference, then most recently created. */
export async function getActiveBudget(userId: string, today: Day, thresholds: Thresholds) {
  const candidates = await db.budget.findMany({
    where: { userId, startDate: { lte: dayToDb(today) }, endDate: { gte: dayToDb(today) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, periodType: true },
  });
  candidates.sort((a, b) => ACTIVE_PREFERENCE.indexOf(a.periodType) - ACTIVE_PREFERENCE.indexOf(b.periodType));
  return candidates[0] ? getBudgetDetail(userId, candidates[0].id, thresholds) : null;
}
