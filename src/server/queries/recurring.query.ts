import "server-only";
import { toMoneyString } from "@/domain/money";
import { dbToDay, type Day } from "@/domain/period";
import { describeSchedule, type RepeatUnit } from "@/domain/recurrence";
import type { ScheduleStatus, TransactionType } from "@/generated/prisma/client";
import { db } from "../db";

export interface RecurringDTO {
  id: string;
  type: TransactionType;
  amount: string;
  currency: string;
  description: string | null;
  category: { id: string; name: string; icon: string; color: string } | null;
  account: { id: string; name: string };
  toAccount: { id: string; name: string } | null;
  unit: RepeatUnit;
  interval: number;
  schedule: string;
  startDate: Day;
  endDate: Day | null;
  nextOccurrence: Day | null;
  status: ScheduleStatus;
  postedCount: number;
}

export async function getRecurringRules(userId: string): Promise<RecurringDTO[]> {
  const rules = await db.recurringRule.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { nextOccurrence: "asc" }],
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      account: { select: { id: true, name: true, currency: true } },
      toAccount: { select: { id: true, name: true } },
      _count: { select: { transactions: true } },
    },
  });
  return rules.map((r) => ({
    id: r.id,
    type: r.type,
    amount: toMoneyString(r.amount),
    currency: r.account.currency,
    description: r.description,
    category: r.category,
    account: { id: r.account.id, name: r.account.name },
    toAccount: r.toAccount,
    unit: r.unit,
    interval: r.interval,
    schedule: describeSchedule(r.unit, r.interval),
    startDate: dbToDay(r.startDate),
    endDate: r.endDate ? dbToDay(r.endDate) : null,
    nextOccurrence: r.nextOccurrence && r.status === "ACTIVE" ? dbToDay(r.nextOccurrence) : null,
    status: r.status,
    postedCount: r._count.transactions,
  }));
}
