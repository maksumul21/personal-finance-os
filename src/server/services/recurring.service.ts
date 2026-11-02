import "server-only";
import { nextAfter, nextOnOrAfter, occurrencesBetween, type Schedule } from "@/domain/recurrence";
import { dayToDb, dbToDay, type Day } from "@/domain/period";
import type { RecurringFormValues } from "@/features/recurring/schemas";
import { transactionFormSchema, type TransactionFormValues } from "@/features/transactions/schemas";
import { Prisma, type RecurringRule } from "@/generated/prisma/client";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";
import { postTransactionTx, validateTransactionTx } from "./transactions.service";

interface Ctx {
  userId: string;
  baseCurrency: string;
}

/** Upper bound on occurrences posted per rule per run (a daily rule started years ago). */
const MAX_PER_RUN = 400;

export function scheduleOf(r: Pick<RecurringRule, "startDate" | "endDate" | "unit" | "interval">): Schedule {
  return { start: dbToDay(r.startDate), end: r.endDate ? dbToDay(r.endDate) : null, unit: r.unit, interval: r.interval };
}

/** The transaction a rule posts for one occurrence. */
function valuesFor(r: Pick<RecurringRule, "type" | "amount" | "accountId" | "toAccountId" | "toAmount" | "categoryId" | "description">, date: Day): TransactionFormValues {
  const common = { amount: r.amount.toFixed(2), date, description: r.description ?? "" };
  return transactionFormSchema.parse(
    r.type === "TRANSFER"
      ? { type: "TRANSFER", fromAccountId: r.accountId, toAccountId: r.toAccountId, toAmount: r.toAmount?.toFixed(2) ?? "", ...common }
      : { type: r.type, accountId: r.accountId, categoryId: r.categoryId, ...common },
  );
}

/**
 * Recurring rules post in the account's own currency, so they're limited to base-currency
 * accounts: a rate recorded months later shouldn't decide today's amount (DECISIONS.md D-022).
 */
async function validate(tx: DbTx, ctx: Ctx, values: RecurringFormValues) {
  const ids = [values.accountId, values.toAccountId].filter(Boolean) as string[];
  const accounts = await tx.account.findMany({ where: { id: { in: ids }, userId: ctx.userId } });
  if (accounts.some((a) => a.currency !== ctx.baseCurrency)) {
    throw new UserFacingError(`Recurring transactions work with ${ctx.baseCurrency} accounts only.`, "accountId");
  }
  // Same checks a real posting runs: ownership, archived accounts, category kind, card rules.
  await validateTransactionTx(tx, ctx, valuesFor(toRow(values), values.startDate));
}

function toRow(v: RecurringFormValues) {
  return {
    type: v.type,
    amount: new Prisma.Decimal(v.amount),
    accountId: v.accountId,
    toAccountId: v.type === "TRANSFER" ? v.toAccountId! : null,
    toAmount: null,
    categoryId: v.type === "TRANSFER" ? null : v.categoryId!,
    description: v.description || null,
  };
}

function ruleData(v: RecurringFormValues, today: Day) {
  const schedule: Schedule = { start: v.startDate, end: v.endDate || null, unit: v.unit, interval: v.interval };
  return {
    ...toRow(v),
    unit: v.unit,
    interval: v.interval,
    startDate: dayToDb(v.startDate),
    endDate: v.endDate ? dayToDb(v.endDate) : null,
    // A start in the past is posted from the start date (the user chose it); see processDueRules.
    nextOccurrence: (() => {
      const n = nextOnOrAfter(schedule, v.startDate < today ? v.startDate : today);
      return n ? dayToDb(n) : null;
    })(),
  };
}

export async function createRecurring(ctx: Ctx, values: RecurringFormValues, today: Day) {
  const id = await db.$transaction(async (tx) => {
    await validate(tx, ctx, values);
    const rule = await tx.recurringRule.create({ data: { userId: ctx.userId, ...ruleData(values, today) } });
    await audit(tx, ctx.userId, "recurring.create", "RecurringRule", rule.id, undefined, values);
    return rule.id;
  });
  await processDueRules(ctx, today, id);
  return { id };
}

/** Edits apply to future occurrences; transactions already posted are left as they are. */
export async function updateRecurring(ctx: Ctx, id: string, values: RecurringFormValues, today: Day) {
  return db.$transaction(async (tx) => {
    const before = await tx.recurringRule.findFirst({ where: { id, userId: ctx.userId } });
    if (!before) throw new UserFacingError("Recurring transaction not found.");
    await validate(tx, ctx, values);
    const data = ruleData(values, today);
    const schedule: Schedule = { start: values.startDate, end: values.endDate || null, unit: values.unit, interval: values.interval };
    const next = nextOnOrAfter(schedule, today);
    await tx.recurringRule.update({ where: { id }, data: { ...data, nextOccurrence: next ? dayToDb(next) : null } });
    await audit(tx, ctx.userId, "recurring.update", "RecurringRule", id, before, values);
    return { id };
  });
}

/**
 * Pause keeps the schedule; resume skips occurrences missed while paused (no surprise backfill);
 * cancel stops it for good.
 */
export async function setRecurringStatus(ctx: Ctx, id: string, status: "ACTIVE" | "PAUSED" | "CANCELLED", today: Day) {
  return db.$transaction(async (tx) => {
    const rule = await tx.recurringRule.findFirst({ where: { id, userId: ctx.userId } });
    if (!rule) throw new UserFacingError("Recurring transaction not found.");
    if (rule.status === "CANCELLED" && status !== "CANCELLED") throw new UserFacingError("A cancelled schedule can't be restarted. Create a new one.");
    const next = status === "ACTIVE" ? nextOnOrAfter(scheduleOf(rule), today) : null;
    await tx.recurringRule.update({
      where: { id },
      data: { status, ...(status === "ACTIVE" ? { nextOccurrence: next ? dayToDb(next) : null } : {}) },
    });
    await audit(tx, ctx.userId, `recurring.${status.toLowerCase()}`, "RecurringRule", id);
    return { id };
  });
}

/** Deletes the schedule. Posted transactions stay, unlinked from it. */
export async function deleteRecurring(ctx: Ctx, id: string) {
  return db.$transaction(async (tx) => {
    const rule = await tx.recurringRule.findFirst({ where: { id, userId: ctx.userId } });
    if (!rule) throw new UserFacingError("Recurring transaction not found.");
    await tx.transaction.updateMany({ where: { recurringRuleId: id }, data: { recurringRuleId: null, occurrenceDate: null } });
    await tx.recurringRule.delete({ where: { id } });
    await audit(tx, ctx.userId, "recurring.delete", "RecurringRule", id, rule);
    return { id };
  });
}

export interface ProcessResult {
  posted: number;
  skippedDuplicates: number;
  paused: { ruleId: string; reason: string }[];
}

/**
 * Posts every due occurrence up to `today`. Idempotent: each occurrence is its own DB transaction
 * keyed by the unique (recurringRuleId, occurrenceDate), so a concurrent or repeated run skips
 * what's already posted instead of duplicating it (PRD §5.7).
 */
export async function processDueRules(ctx: Ctx, today: Day, onlyRuleId?: string): Promise<ProcessResult> {
  const result: ProcessResult = { posted: 0, skippedDuplicates: 0, paused: [] };
  const rules = await db.recurringRule.findMany({
    where: { userId: ctx.userId, status: "ACTIVE", nextOccurrence: { lte: dayToDb(today) }, ...(onlyRuleId ? { id: onlyRuleId } : {}) },
  });

  for (const rule of rules) {
    const schedule = scheduleOf(rule);
    const due = occurrencesBetween(schedule, dbToDay(rule.nextOccurrence!), today).slice(0, MAX_PER_RUN);
    let lastDone: Day | null = null;
    let pausedReason: string | null = null;

    for (const date of due) {
      try {
        await db.$transaction((tx) =>
          postTransactionTx(tx, ctx, valuesFor(rule, date), { source: "RECURRING", recurringRuleId: rule.id, occurrenceDate: date }),
        );
        result.posted++;
        lastDone = date;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          result.skippedDuplicates++;
          lastDone = date;
          continue;
        }
        if (err instanceof UserFacingError) {
          pausedReason = err.message;
          break;
        }
        throw err;
      }
    }

    const next = lastDone ? nextAfter(schedule, lastDone) : dbToDay(rule.nextOccurrence!);
    await db.recurringRule.update({
      where: { id: rule.id },
      data: {
        nextOccurrence: next ? dayToDb(next) : null,
        ...(pausedReason ? { status: "PAUSED" as const } : {}),
      },
    });
    if (pausedReason) {
      result.paused.push({ ruleId: rule.id, reason: pausedReason });
      await db.auditLog.create({
        data: { userId: ctx.userId, action: "recurring.auto-pause", entityType: "RecurringRule", entityId: rule.id, after: { reason: pausedReason } },
      });
    }
  }
  return result;
}

/** Cheap check used on page loads: is anything due for this user? */
export async function hasDueRules(userId: string, today: Day) {
  const n = await db.recurringRule.count({ where: { userId, status: "ACTIVE", nextOccurrence: { lte: dayToDb(today) } } });
  return n > 0;
}
