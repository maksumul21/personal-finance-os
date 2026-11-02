import "server-only";
import { periodContaining, TEMPLATE_TARGETS } from "@/domain/budget";
import { toMoney } from "@/domain/money";
import { dayToDb } from "@/domain/period";
import type { AllocationFormValues, BudgetFormValues } from "@/features/budgets/schemas";
import type { AllocationKind } from "@/generated/prisma/client";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";

/** Budget allocations are planning entries only (PRD §6.4): nothing here touches the ledger. */

async function ownedBudget(tx: DbTx, userId: string, id: string) {
  const budget = await tx.budget.findFirst({ where: { id, userId } });
  if (!budget) throw new UserFacingError("Budget not found.");
  return budget;
}

/** Template planning lines created with a 50/30/20 or 70/20/10 budget when income is known. */
function templateLines(method: BudgetFormValues["method"], income: string | null) {
  const targets = TEMPLATE_TARGETS[method];
  if (!targets || !income) return [];
  const pctOf = (p: number) => toMoney(income).times(p).div(100).toDecimalPlaces(2).toFixed(2);
  const lines: { kind: AllocationKind; label: string; allocatedAmount: string }[] = [];
  if (targets.savings) lines.push({ kind: "SAVINGS", label: "Savings", allocatedAmount: pctOf(targets.savings) });
  if (targets.debt) lines.push({ kind: "DEBT_REPAYMENT", label: "Debt repayment & giving", allocatedAmount: pctOf(targets.debt) });
  return lines;
}

export async function createBudget(userId: string, values: BudgetFormValues, weekStartsOn: number) {
  const period =
    values.periodType === "CUSTOM"
      ? { start: values.start, end: values.end! }
      : periodContaining(values.periodType, values.start, weekStartsOn);

  return db.$transaction(async (tx) => {
    const budget = await tx.budget.create({
      data: {
        userId,
        name: values.name,
        periodType: values.periodType,
        startDate: dayToDb(period.start),
        endDate: dayToDb(period.end),
        method: values.method,
        incomeSource: values.incomeSource,
        plannedIncome: values.plannedIncome,
      },
    });

    if (values.copyFromId) {
      const source = await ownedBudget(tx, userId, values.copyFromId);
      const lines = await tx.budgetAllocation.findMany({ where: { budgetId: source.id }, orderBy: { sortOrder: "asc" } });
      if (lines.length) {
        await tx.budgetAllocation.createMany({
          data: lines.map((l, i) => ({
            budgetId: budget.id,
            kind: l.kind,
            categoryId: l.categoryId,
            label: l.label,
            allocatedAmount: l.allocatedAmount,
            rolloverEnabled: l.rolloverEnabled,
            sortOrder: i,
          })),
        });
      }
    } else {
      const lines = templateLines(values.method, values.plannedIncome);
      if (lines.length) {
        await tx.budgetAllocation.createMany({ data: lines.map((l, i) => ({ budgetId: budget.id, sortOrder: 100 + i, ...l })) });
      }
    }
    await audit(tx, userId, "budget.create", "Budget", budget.id, undefined, values);
    return { id: budget.id };
  });
}

export async function updateBudgetSettings(
  userId: string,
  input: { id: string; name: string; incomeSource: "PLANNED" | "ACTUAL"; plannedIncome: string | null },
) {
  return db.$transaction(async (tx) => {
    const before = await ownedBudget(tx, userId, input.id);
    await tx.budget.update({
      where: { id: before.id },
      data: { name: input.name, incomeSource: input.incomeSource, plannedIncome: input.plannedIncome },
    });
    await audit(tx, userId, "budget.update", "Budget", input.id, before, input);
    return { id: input.id };
  });
}

export async function deleteBudget(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const before = await ownedBudget(tx, userId, id);
    await tx.budget.delete({ where: { id: before.id } });
    await audit(tx, userId, "budget.delete", "Budget", id, before);
    return { id };
  });
}

/**
 * A group's limit already covers its subcategories, so a budget can't limit both a group and one
 * of its subcategories (spending would be counted twice).
 */
async function assertNoOverlap(tx: DbTx, userId: string, budgetId: string, categoryId: string) {
  const category = await tx.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) throw new UserFacingError("Category not found.", "categoryId");
  if (category.kind !== "EXPENSE") throw new UserFacingError("Budgets limit expense categories.", "categoryId");
  const existing = await tx.budgetAllocation.findMany({
    where: { budgetId, kind: "EXPENSE_CATEGORY" },
    include: { category: { select: { id: true, name: true, parentId: true } } },
  });
  for (const line of existing) {
    const c = line.category!;
    if (c.id === category.id) throw new UserFacingError(`${category.name} already has a limit in this budget.`, "categoryId");
    if (c.id === category.parentId) {
      throw new UserFacingError(`${c.name} already includes ${category.name}. Remove that limit first.`, "categoryId");
    }
    if (c.parentId === category.id) {
      throw new UserFacingError(`${c.name} is already limited inside ${category.name}. Remove that limit first.`, "categoryId");
    }
  }
}

export async function addAllocation(userId: string, values: AllocationFormValues) {
  return db.$transaction(async (tx) => {
    await ownedBudget(tx, userId, values.budgetId);
    if (values.kind === "EXPENSE_CATEGORY") await assertNoOverlap(tx, userId, values.budgetId, values.categoryId!);
    const sortOrder = await tx.budgetAllocation.count({ where: { budgetId: values.budgetId } });
    const line = await tx.budgetAllocation.create({
      data: {
        budgetId: values.budgetId,
        kind: values.kind,
        categoryId: values.kind === "EXPENSE_CATEGORY" ? values.categoryId : null,
        label: values.kind === "EXPENSE_CATEGORY" ? null : values.label,
        allocatedAmount: values.allocatedAmount,
        rolloverEnabled: values.kind === "EXPENSE_CATEGORY" ? values.rolloverEnabled : false,
        sortOrder,
      },
    });
    await audit(tx, userId, "budget.line.create", "BudgetAllocation", line.id, undefined, values);
    return { id: line.id };
  });
}

async function ownedLine(tx: DbTx, userId: string, id: string) {
  const line = await tx.budgetAllocation.findFirst({ where: { id, budget: { userId } } });
  if (!line) throw new UserFacingError("Budget line not found.");
  return line;
}

export async function updateAllocation(
  userId: string,
  input: { id: string; allocatedAmount: string; rolloverEnabled: boolean; label?: string },
) {
  return db.$transaction(async (tx) => {
    const before = await ownedLine(tx, userId, input.id);
    await tx.budgetAllocation.update({
      where: { id: before.id },
      data: {
        allocatedAmount: input.allocatedAmount,
        rolloverEnabled: before.kind === "EXPENSE_CATEGORY" ? input.rolloverEnabled : false,
        label: before.kind === "EXPENSE_CATEGORY" ? null : (input.label || before.label),
      },
    });
    await audit(tx, userId, "budget.line.update", "BudgetAllocation", input.id, before, input);
    return { id: input.id, budgetId: before.budgetId };
  });
}

export async function deleteAllocation(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const before = await ownedLine(tx, userId, id);
    await tx.budgetAllocation.delete({ where: { id: before.id } });
    await audit(tx, userId, "budget.line.delete", "BudgetAllocation", id, before);
    return { id, budgetId: before.budgetId };
  });
}
