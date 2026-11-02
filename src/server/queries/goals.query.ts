import "server-only";
import { goalProgress, monthsCovered, savedAmount, type GoalPace } from "@/domain/goals";
import { ZERO, toMoney, toMoneyString } from "@/domain/money";
import { dayToDb, dbToDay, monthOf, type Day } from "@/domain/period";
import type { GoalPriority, GoalStatus, GoalType } from "@/generated/prisma/client";
import { db } from "../db";

export interface ContributionDTO {
  id: string;
  direction: "DEPOSIT" | "WITHDRAWAL";
  amount: string;
  date: Day;
  notes: string | null;
  /** Account on the other side of the transfer; null for an earmark (no money moved). */
  otherAccount: string | null;
}

export interface GoalDTO {
  id: string;
  name: string;
  goalType: GoalType;
  status: GoalStatus;
  priority: GoalPriority;
  icon: string;
  color: string;
  description: string | null;
  targetDate: Day | null;
  createdOn: Day;
  linkedAccount: { id: string; name: string; currency: string } | null;
  essentialMonthly: string | null;
  targetMonths: number | null;
  target: string;
  saved: string;
  remaining: string;
  progressPct: string;
  monthsLeft: number | null;
  requiredMonthly: string | null;
  pace: GoalPace;
  /** Emergency fund only. */
  monthsCovered: string | null;
  contributions: ContributionDTO[];
}

export async function getGoals(userId: string, today: Day): Promise<GoalDTO[]> {
  const goals = await db.savingsGoal.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    include: {
      linkedAccount: { select: { id: true, name: true, currency: true } },
      contributions: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: {
          transaction: { select: { entries: { select: { account: { select: { id: true, name: true } } } } } },
        },
      },
    },
  });
  return goals.map((g) => {
    const saved = savedAmount(g.contributions);
    const createdOn = dbToDay(g.createdAt);
    const p = goalProgress({
      target: g.targetAmount,
      saved,
      targetDate: g.targetDate ? dbToDay(g.targetDate) : null,
      createdOn,
      today,
    });
    return {
      id: g.id,
      name: g.name,
      goalType: g.goalType,
      status: g.status,
      priority: g.priority,
      icon: g.icon,
      color: g.color,
      description: g.description,
      targetDate: g.targetDate ? dbToDay(g.targetDate) : null,
      createdOn,
      linkedAccount: g.linkedAccount,
      essentialMonthly: g.essentialMonthly ? toMoneyString(g.essentialMonthly) : null,
      targetMonths: g.targetMonths,
      target: toMoneyString(p.target),
      saved: toMoneyString(p.saved),
      remaining: toMoneyString(p.remaining),
      progressPct: p.progressPct.toFixed(1),
      monthsLeft: p.monthsLeft,
      requiredMonthly: p.requiredMonthly ? toMoneyString(p.requiredMonthly) : null,
      pace: p.pace,
      monthsCovered: g.essentialMonthly ? (monthsCovered(saved, g.essentialMonthly)?.toFixed(1) ?? null) : null,
      contributions: g.contributions.map((c) => ({
        id: c.id,
        direction: c.direction,
        amount: toMoneyString(c.amount),
        date: dbToDay(c.date),
        notes: c.notes,
        otherAccount: c.transaction?.entries.find((e) => e.account.id !== g.linkedAccountId)?.account.name ?? null,
      })),
    };
  });
}

/**
 * Suggested essential monthly expenses: average spending in essential categories (and the
 * subcategories of essential groups) over the last three full months. Null without data.
 */
export async function suggestEssentialMonthly(userId: string, today: Day): Promise<{ amount: string; months: number } | null> {
  const end = monthOf(today, -1);
  const start = monthOf(today, -3);
  const categories = await db.category.findMany({
    where: { userId, kind: "EXPENSE" },
    select: { id: true, parentId: true, isEssential: true },
  });
  const essentialGroups = new Set(categories.filter((c) => !c.parentId && c.isEssential).map((c) => c.id));
  const ids = categories.filter((c) => c.isEssential || (c.parentId && essentialGroups.has(c.parentId))).map((c) => c.id);
  if (ids.length === 0) return null;

  const rows = await db.transaction.groupBy({
    by: ["isRefund"],
    where: { userId, type: "EXPENSE", categoryId: { in: ids }, date: { gte: dayToDb(start.start), lte: dayToDb(end.end) } },
    _sum: { baseAmount: true },
  });
  let total = ZERO;
  for (const r of rows) {
    const amt = toMoney(r._sum.baseAmount ?? 0);
    total = r.isRefund ? total.minus(amt) : total.plus(amt);
  }
  if (!total.greaterThan(0)) return null;
  return { amount: total.div(3).toDecimalPlaces(0).toFixed(2), months: 3 };
}
