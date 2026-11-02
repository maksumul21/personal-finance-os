import "server-only";
import { BILL_HORIZON_DAYS } from "@/domain/bills";
import { addDaysTo, dayToDb, dbToDay, type Day } from "@/domain/period";
import { occurrencesBetween, type RepeatUnit, type Schedule } from "@/domain/recurrence";
import type { BillFormValues, PayBillValues } from "@/features/bills/schemas";
import { transactionFormSchema } from "@/features/transactions/schemas";
import type { Bill } from "@/generated/prisma/client";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";
import { postTransactionTx, removeTransactionTx, validateTransactionTx } from "./transactions.service";

interface Ctx {
  userId: string;
  baseCurrency: string;
}

export function billSchedule(b: Pick<Bill, "firstDueDate" | "endDate" | "unit" | "interval">): Schedule {
  return { start: dbToDay(b.firstDueDate), end: b.endDate ? dbToDay(b.endDate) : null, unit: b.unit as RepeatUnit | null, interval: b.interval };
}

function billData(v: BillFormValues) {
  return {
    name: v.name,
    amount: v.amount,
    categoryId: v.categoryId,
    paymentAccountId: v.paymentAccountId,
    unit: v.unit === "ONCE" ? null : v.unit,
    interval: v.unit === "ONCE" ? 1 : v.interval,
    firstDueDate: dayToDb(v.firstDueDate),
    endDate: v.endDate ? dayToDb(v.endDate) : null,
    isSubscription: v.isSubscription,
    notes: v.notes || null,
  };
}

/** A bill must be payable: same checks as the expense its payment will create. */
async function validate(tx: DbTx, ctx: Ctx, v: BillFormValues) {
  await validateTransactionTx(
    tx,
    ctx,
    transactionFormSchema.parse({ type: "EXPENSE", accountId: v.paymentAccountId, categoryId: v.categoryId, amount: v.amount, date: v.firstDueDate }),
  ).catch((err) => {
    // A missing exchange rate shouldn't block saving a bill; it's needed only when paying.
    if (err instanceof UserFacingError && err.field === "exchangeRate") return;
    throw err;
  });
}

/**
 * Creates occurrence rows up to the horizon. Idempotent: (billId, dueDate) is unique and
 * createMany skips existing rows.
 */
export async function ensureOccurrences(userId: string, today: Day, billId?: string) {
  const horizon = addDaysTo(today, BILL_HORIZON_DAYS);
  const bills = await db.bill.findMany({ where: { userId, status: "ACTIVE", ...(billId ? { id: billId } : {}) } });
  for (const b of bills) {
    const dates = occurrencesBetween(billSchedule(b), dbToDay(b.firstDueDate), horizon);
    if (dates.length === 0) continue;
    await db.billOccurrence.createMany({
      data: dates.map((d) => ({ billId: b.id, userId, dueDate: dayToDb(d), amount: b.amount })),
      skipDuplicates: true,
    });
  }
}

/** Removes future unpaid occurrences (after a schedule change, pause or cancel). */
async function clearFuturePending(tx: DbTx, billId: string, today: Day) {
  await tx.billOccurrence.deleteMany({ where: { billId, state: "PENDING", dueDate: { gte: dayToDb(today) } } });
}

export async function createBill(ctx: Ctx, values: BillFormValues, today: Day) {
  const id = await db.$transaction(async (tx) => {
    await validate(tx, ctx, values);
    const bill = await tx.bill.create({ data: { userId: ctx.userId, ...billData(values) } });
    await audit(tx, ctx.userId, "bill.create", "Bill", bill.id, undefined, values);
    return bill.id;
  });
  await ensureOccurrences(ctx.userId, today, id);
  return { id };
}

/** Changes apply from today: future unpaid occurrences are regenerated, past ones are kept. */
export async function updateBill(ctx: Ctx, id: string, values: BillFormValues, today: Day) {
  await db.$transaction(async (tx) => {
    const before = await tx.bill.findFirst({ where: { id, userId: ctx.userId } });
    if (!before) throw new UserFacingError("Bill not found.");
    await validate(tx, ctx, values);
    await tx.bill.update({ where: { id }, data: billData(values) });
    await clearFuturePending(tx, id, today);
    await audit(tx, ctx.userId, "bill.update", "Bill", id, before, values);
  });
  await ensureOccurrences(ctx.userId, today, id);
  return { id };
}

export async function setBillStatus(ctx: Ctx, id: string, status: "ACTIVE" | "PAUSED" | "CANCELLED", today: Day) {
  await db.$transaction(async (tx) => {
    const bill = await tx.bill.findFirst({ where: { id, userId: ctx.userId } });
    if (!bill) throw new UserFacingError("Bill not found.");
    await tx.bill.update({ where: { id }, data: { status } });
    if (status !== "ACTIVE") await clearFuturePending(tx, id, today);
    await audit(tx, ctx.userId, `bill.${status.toLowerCase()}`, "Bill", id);
  });
  if (status === "ACTIVE") await ensureOccurrences(ctx.userId, today, id);
  return { id };
}

/** Deletes the bill and its schedule. Expenses already recorded for it stay in the ledger. */
export async function deleteBill(ctx: Ctx, id: string) {
  return db.$transaction(async (tx) => {
    const bill = await tx.bill.findFirst({ where: { id, userId: ctx.userId } });
    if (!bill) throw new UserFacingError("Bill not found.");
    await tx.bill.delete({ where: { id } });
    await audit(tx, ctx.userId, "bill.delete", "Bill", id, bill);
    return { id };
  });
}

async function ownedOccurrence(tx: DbTx, userId: string, id: string) {
  const o = await tx.billOccurrence.findFirst({ where: { id, userId }, include: { bill: true } });
  if (!o) throw new UserFacingError("Bill payment not found.");
  return o;
}

/**
 * PRD §9.4: paying creates the expense and links it, once. The state flip is conditional on
 * PENDING, so a double click or concurrent request can't create a second expense.
 */
export async function payBill(ctx: Ctx, v: PayBillValues) {
  return db.$transaction(async (tx) => {
    const o = await ownedOccurrence(tx, ctx.userId, v.occurrenceId);
    if (o.state === "PAID") throw new UserFacingError("This bill is already marked paid.");

    let transactionId: string | null = null;
    if (!v.alreadyRecorded) {
      // The bill's amount is in its payment account's currency; paying from another currency
      // would post that number unconverted.
      if (v.accountId && v.accountId !== o.bill.paymentAccountId) {
        const usual = await tx.account.findFirst({ where: { id: o.bill.paymentAccountId, userId: ctx.userId }, select: { currency: true } });
        const chosen = await tx.account.findFirst({ where: { id: v.accountId, userId: ctx.userId }, select: { currency: true } });
        if (chosen && usual && chosen.currency !== usual.currency) {
          throw new UserFacingError(`Pay this bill from a ${usual.currency} account.`, "accountId");
        }
      }
      const posted = await postTransactionTx(
        tx,
        ctx,
        transactionFormSchema.parse({
          type: "EXPENSE",
          accountId: v.accountId || o.bill.paymentAccountId,
          categoryId: o.bill.categoryId,
          amount: v.amount || o.amount.toFixed(2),
          date: v.date,
          description: o.bill.name,
        }),
        { source: "BILL" },
      );
      transactionId = posted.id;
    }

    const { count } = await tx.billOccurrence.updateMany({
      where: { id: o.id, state: { not: "PAID" } },
      data: { state: "PAID", paidAt: dayToDb(v.date), transactionId },
    });
    if (count !== 1) throw new UserFacingError("This bill was just marked paid.");
    await audit(tx, ctx.userId, "bill.pay", "BillOccurrence", o.id, o, v);
    return { id: o.id, transactionId };
  });
}

/** Undo a payment: removes the expense it created (if any) and puts the bill back to unpaid. */
export async function unpayBill(ctx: Ctx, occurrenceId: string) {
  return db.$transaction(async (tx) => {
    const o = await ownedOccurrence(tx, ctx.userId, occurrenceId);
    if (o.state !== "PAID") throw new UserFacingError("This bill isn't marked paid.");
    await tx.billOccurrence.update({ where: { id: o.id }, data: { state: "PENDING", paidAt: null, transactionId: null } });
    if (o.transactionId) await removeTransactionTx(tx, ctx, o.transactionId);
    await audit(tx, ctx.userId, "bill.unpay", "BillOccurrence", o.id, o);
    return { id: o.id };
  });
}

export async function setOccurrenceSkipped(ctx: Ctx, occurrenceId: string, skipped: boolean) {
  return db.$transaction(async (tx) => {
    const o = await ownedOccurrence(tx, ctx.userId, occurrenceId);
    if (o.state === "PAID") throw new UserFacingError("Undo the payment first.");
    await tx.billOccurrence.update({ where: { id: o.id }, data: { state: skipped ? "SKIPPED" : "PENDING" } });
    await audit(tx, ctx.userId, skipped ? "bill.skip" : "bill.unskip", "BillOccurrence", o.id);
    return { id: o.id };
  });
}
