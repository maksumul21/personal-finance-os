import "server-only";
import { billStatus, type BillStatus } from "@/domain/bills";
import { ZERO, sum, toMoneyString } from "@/domain/money";
import { addDaysTo, dayToDb, dbToDay, monthOf, type Day } from "@/domain/period";
import { annualEquivalent, describeSchedule, monthlyEquivalent, type RepeatUnit } from "@/domain/recurrence";
import type { ScheduleStatus } from "@/generated/prisma/client";
import { db } from "../db";

export interface OccurrenceDTO {
  id: string;
  billId: string;
  name: string;
  isSubscription: boolean;
  dueDate: Day;
  amount: string;
  currency: string;
  status: BillStatus;
  paidAt: Day | null;
  transactionId: string | null;
  accountName: string;
}

export interface BillDTO {
  id: string;
  name: string;
  amount: string;
  currency: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  paymentAccountId: string;
  paymentAccountName: string;
  unit: RepeatUnit | null;
  interval: number;
  schedule: string;
  firstDueDate: Day;
  endDate: Day | null;
  isSubscription: boolean;
  notes: string | null;
  status: ScheduleStatus;
  monthlyCost: string;
  annualCost: string;
  /** Earliest unpaid occurrence (may be overdue). */
  next: OccurrenceDTO | null;
}

const occInclude = { bill: { include: { paymentAccount: { select: { name: true, currency: true } } } } } as const;

type OccRow = Awaited<ReturnType<typeof db.billOccurrence.findFirstOrThrow<{ include: typeof occInclude }>>>;

function occDTO(o: OccRow, today: Day): OccurrenceDTO {
  const due = dbToDay(o.dueDate);
  return {
    id: o.id,
    billId: o.billId,
    name: o.bill.name,
    isSubscription: o.bill.isSubscription,
    dueDate: due,
    amount: toMoneyString(o.amount),
    currency: o.bill.paymentAccount.currency,
    status: billStatus(o.state, due, today),
    paidAt: o.paidAt ? dbToDay(o.paidAt) : null,
    transactionId: o.transactionId,
    accountName: o.bill.paymentAccount.name,
  };
}

export async function getBills(userId: string, today: Day): Promise<BillDTO[]> {
  const [bills, pending] = await Promise.all([
    db.bill.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        category: { select: { name: true, icon: true, color: true } },
        paymentAccount: { select: { name: true, currency: true } },
      },
    }),
    db.billOccurrence.findMany({
      where: { userId, state: "PENDING" },
      orderBy: { dueDate: "asc" },
      include: occInclude,
    }),
  ]);
  const nextByBill = new Map<string, OccRow>();
  for (const o of pending) if (!nextByBill.has(o.billId)) nextByBill.set(o.billId, o);

  return bills.map((b) => {
    const unit = b.unit as RepeatUnit | null;
    const next = nextByBill.get(b.id);
    return {
      id: b.id,
      name: b.name,
      amount: toMoneyString(b.amount),
      currency: b.paymentAccount.currency,
      categoryId: b.categoryId,
      categoryName: b.category.name,
      categoryIcon: b.category.icon,
      categoryColor: b.category.color,
      paymentAccountId: b.paymentAccountId,
      paymentAccountName: b.paymentAccount.name,
      unit,
      interval: b.interval,
      schedule: describeSchedule(unit, b.interval),
      firstDueDate: dbToDay(b.firstDueDate),
      endDate: b.endDate ? dbToDay(b.endDate) : null,
      isSubscription: b.isSubscription,
      notes: b.notes,
      status: b.status,
      monthlyCost: toMoneyString(monthlyEquivalent(b.amount, unit, b.interval)),
      annualCost: toMoneyString(annualEquivalent(b.amount, unit, b.interval)),
      next: next ? occDTO(next, today) : null,
    };
  });
}

/** All occurrences in the calendar month containing `day` (PRD §9.2). */
export async function getMonthOccurrences(userId: string, day: Day, today: Day): Promise<OccurrenceDTO[]> {
  const m = monthOf(day);
  const rows = await db.billOccurrence.findMany({
    where: { userId, dueDate: { gte: dayToDb(m.start), lte: dayToDb(m.end) } },
    orderBy: [{ dueDate: "asc" }],
    include: occInclude,
  });
  return rows.map((o) => occDTO(o, today));
}

/** Overdue plus unpaid bills due in the next `days` days (dashboard, PRD §4.4). */
export async function getUpcomingBills(userId: string, today: Day, days = 30) {
  const rows = await db.billOccurrence.findMany({
    where: { userId, state: "PENDING", dueDate: { lte: dayToDb(addDaysTo(today, days)) }, bill: { status: "ACTIVE" } },
    orderBy: { dueDate: "asc" },
    include: occInclude,
  });
  const items = rows.map((o) => occDTO(o, today));
  const sameCurrency = items.filter((i) => i.currency === items[0]?.currency);
  return {
    items,
    overdueCount: items.filter((i) => i.status === "OVERDUE").length,
    /** Total of the listed bills; only meaningful when they share a currency. */
    total: sameCurrency.length === items.length ? toMoneyString(sum(items.map((i) => i.amount))) : null,
  };
}

export function subscriptionSummary(bills: BillDTO[], baseCurrency: string) {
  const active = bills.filter((b) => b.isSubscription && b.status === "ACTIVE" && b.currency === baseCurrency);
  return {
    count: active.length,
    monthly: toMoneyString(active.reduce((a, b) => a.plus(b.monthlyCost), ZERO)),
    annual: toMoneyString(active.reduce((a, b) => a.plus(b.annualCost), ZERO)),
    otherCurrencyCount: bills.filter((b) => b.isSubscription && b.status === "ACTIVE" && b.currency !== baseCurrency).length,
  };
}
