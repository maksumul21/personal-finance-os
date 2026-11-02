import "server-only";
import { accountNature } from "@/domain/accounts";
import { assertPostingInvariants, buildPosting, type LedgerInput } from "@/domain/ledger";
import { toMoney } from "@/domain/money";
import { dayToDb } from "@/domain/period";
import type { TransactionFormValues } from "@/features/transactions/schemas";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";

interface Ctx {
  userId: string;
  baseCurrency: string;
}

/** Loads an account the user owns. New activity can't be posted to an archived account. */
async function ownedAccount(tx: DbTx, ctx: Ctx, id: string, field: string, allowArchivedId?: Set<string>) {
  const account = await tx.account.findFirst({ where: { id, userId: ctx.userId } });
  if (!account) throw new UserFacingError("Account not found.", field);
  if (account.isArchived && !allowArchivedId?.has(id)) {
    throw new UserFacingError(`“${account.name}” is archived. Restore it to record transactions.`, field);
  }
  return account;
}

async function ownedCategory(tx: DbTx, ctx: Ctx, id: string, kind: "INCOME" | "EXPENSE", keepId?: string | null) {
  const category = await tx.category.findFirst({ where: { id, userId: ctx.userId } });
  if (!category) throw new UserFacingError("Category not found.", "categoryId");
  if (category.kind !== kind) {
    throw new UserFacingError(`Pick an ${kind === "INCOME" ? "income" : "expense"} category.`, "categoryId");
  }
  if (category.isArchived && category.id !== keepId) {
    throw new UserFacingError(`“${category.name}” is archived. Pick another category.`, "categoryId");
  }
  return category;
}

/**
 * Exchange rate for an amount in `currency` on `date`: 1 for the base currency, otherwise the
 * rate the user typed, otherwise the latest recorded rate on or before the date. Never guessed.
 */
async function resolveRate(tx: DbTx, ctx: Ctx, currency: string, date: string, typed?: string) {
  if (currency === ctx.baseCurrency) return "1";
  if (typed) return typed;
  const recorded = await tx.exchangeRate.findFirst({
    where: { userId: ctx.userId, currency, date: { lte: dayToDb(date) } },
    orderBy: { date: "desc" },
  });
  if (!recorded) {
    throw new UserFacingError(
      `No ${currency} → ${ctx.baseCurrency} exchange rate is recorded for this date. Enter one.`,
      "exchangeRate",
    );
  }
  return recorded.rate.toString();
}

async function upsertTags(tx: DbTx, userId: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const tags = [];
  for (const name of unique) {
    tags.push(
      await tx.tag.upsert({ where: { userId_name: { userId, name } }, create: { userId, name }, update: {}, select: { id: true } }),
    );
  }
  return tags.map((t) => t.id);
}

/** Validates the input and produces the rows to persist. Shared by create and update. */
async function prepare(tx: DbTx, ctx: Ctx, values: TransactionFormValues, existing?: { categoryId: string | null; accountIds: Set<string> }) {
  if (values.type === "TRANSFER") {
    const from = await ownedAccount(tx, ctx, values.fromAccountId, "fromAccountId", existing?.accountIds);
    const to = await ownedAccount(tx, ctx, values.toAccountId, "toAccountId", existing?.accountIds);
    const sameCurrency = from.currency === to.currency;
    if (!sameCurrency && !values.toAmount) {
      throw new UserFacingError(`Enter the amount received in ${to.currency}.`, "toAmount");
    }
    const rate = await resolveRate(tx, ctx, from.currency, values.date, values.exchangeRate);
    const input: LedgerInput = {
      type: "TRANSFER",
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: values.amount,
      toAmount: sameCurrency ? undefined : values.toAmount,
      exchangeRate: rate,
    };
    return { input, currency: from.currency, categoryId: null, isRefund: false };
  }

  const account = await ownedAccount(tx, ctx, values.accountId, "accountId", existing?.accountIds);
  await ownedCategory(tx, ctx, values.categoryId, values.type, existing?.categoryId);
  const rate = await resolveRate(tx, ctx, account.currency, values.date, values.exchangeRate);
  const isRefund = values.type === "EXPENSE" && values.isRefund;
  if (values.type === "INCOME" && accountNature(account.type) === "LIABILITY") {
    throw new UserFacingError("Income can’t go to a credit card or loan. Record a transfer instead.", "accountId");
  }
  const input: LedgerInput =
    values.type === "INCOME"
      ? { type: "INCOME", accountId: account.id, amount: values.amount, exchangeRate: rate }
      : { type: "EXPENSE", accountId: account.id, amount: values.amount, exchangeRate: rate, isRefund };
  return { input, currency: account.currency, categoryId: values.categoryId, isRefund };
}

/** Where a transaction came from; recurring ones carry the idempotency key (rule, occurrence). */
export interface PostOrigin {
  source?: "MANUAL" | "RECURRING" | "BILL" | "GOAL" | "DEBT";
  recurringRuleId?: string;
  occurrenceDate?: string;
}

async function persist(
  tx: DbTx,
  ctx: Ctx,
  values: TransactionFormValues,
  prepared: Awaited<ReturnType<typeof prepare>>,
  id?: string,
  origin: PostOrigin = {},
) {
  const posting = buildPosting(prepared.input);
  assertPostingInvariants(prepared.input.type, posting.entries);
  const date = dayToDb(values.date);
  const data = {
    type: values.type,
    date,
    amount: posting.amount.toFixed(2),
    currency: prepared.currency,
    exchangeRate: posting.exchangeRate.toString(),
    baseAmount: posting.baseAmount.toFixed(2),
    categoryId: prepared.categoryId,
    description: values.description || null,
    notes: values.notes || null,
    isRefund: prepared.isRefund,
  };

  const transaction = id
    ? await tx.transaction.update({ where: { id }, data })
    : await tx.transaction.create({
        data: {
          userId: ctx.userId,
          ...data,
          source: origin.source ?? "MANUAL",
          recurringRuleId: origin.recurringRuleId ?? null,
          occurrenceDate: origin.occurrenceDate ? dayToDb(origin.occurrenceDate) : null,
        },
      });

  if (id) {
    await tx.ledgerEntry.deleteMany({ where: { transactionId: id } });
    await tx.transactionTag.deleteMany({ where: { transactionId: id } });
  }
  await tx.ledgerEntry.createMany({
    data: posting.entries.map((e) => ({
      transactionId: transaction.id,
      userId: ctx.userId,
      accountId: e.accountId,
      date,
      amount: e.amount.toFixed(4),
      baseAmount: e.baseAmount.toFixed(4),
    })),
  });
  const tagIds = await upsertTags(tx, ctx.userId, values.tags);
  if (tagIds.length) {
    await tx.transactionTag.createMany({ data: tagIds.map((tagId) => ({ transactionId: transaction.id, tagId })) });
  }
  return transaction;
}

/**
 * Validates and posts a transaction inside an existing DB transaction. Used by goals, bills and
 * the recurring processor so their own rows and the ledger change atomically.
 */
export async function postTransactionTx(tx: DbTx, ctx: Ctx, values: TransactionFormValues, origin: PostOrigin = {}) {
  const prepared = await prepare(tx, ctx, values);
  const created = await persist(tx, ctx, values, prepared, undefined, origin);
  await audit(tx, ctx.userId, "transaction.create", "Transaction", created.id, undefined, { ...values, ...origin });
  return { id: created.id };
}

/** Runs every check a real posting would (ownership, archive state, category kind, rate) without saving. */
export async function validateTransactionTx(tx: DbTx, ctx: Ctx, values: TransactionFormValues) {
  const prepared = await prepare(tx, ctx, values);
  const posting = buildPosting(prepared.input);
  assertPostingInvariants(prepared.input.type, posting.entries);
}

/** Deletes a transaction inside an existing DB transaction (entries and tags cascade). */
export async function removeTransactionTx(tx: DbTx, ctx: Ctx, id: string) {
  const existing = await tx.transaction.findFirst({ where: { id, userId: ctx.userId }, include: { entries: true } });
  if (!existing) throw new UserFacingError("Transaction not found.");
  await tx.transaction.delete({ where: { id: existing.id } });
  await audit(tx, ctx.userId, "transaction.delete", "Transaction", id, existing);
}

export async function createTransaction(ctx: Ctx, values: TransactionFormValues) {
  return db.$transaction((tx) => postTransactionTx(tx, ctx, values));
}

/**
 * Replaces the transaction's postings atomically. Archived accounts/categories already on the
 * transaction stay allowed, so old records remain editable.
 */
export async function updateTransaction(ctx: Ctx, id: string, values: TransactionFormValues) {
  return db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id, userId: ctx.userId },
      include: {
        entries: { select: { accountId: true } },
        goalContribution: { select: { id: true } },
        billOccurrence: { select: { id: true } },
        loanPrincipalOf: { select: { id: true } },
        loanInterestOf: { select: { id: true } },
      },
    });
    if (!existing) throw new UserFacingError("Transaction not found.");
    if (existing.goalContribution) {
      throw new UserFacingError("This transfer belongs to a savings goal contribution. Edit it from the goal.");
    }
    if (existing.loanPrincipalOf || existing.loanInterestOf) {
      throw new UserFacingError("This is part of a loan payment. Delete and re-record the payment from Debts.");
    }
    if (existing.billOccurrence && values.type !== "EXPENSE") {
      throw new UserFacingError("This expense paid a bill, so it must stay an expense. Unmark the bill payment to change it.");
    }
    const prepared = await prepare(tx, ctx, values, {
      categoryId: existing.categoryId,
      accountIds: new Set(existing.entries.map((e) => e.accountId)),
    });
    await persist(tx, ctx, values, prepared, existing.id);
    await audit(tx, ctx.userId, "transaction.update", "Transaction", id, existing, { ...values });
    return { id };
  });
}

export async function deleteTransaction(ctx: Ctx, id: string) {
  return db.$transaction(async (tx) => {
    const linked = await tx.transaction.findFirst({
      where: { id, userId: ctx.userId },
      select: {
        goalContribution: { select: { id: true } },
        billOccurrence: { select: { id: true } },
        loanPrincipalOf: { select: { id: true } },
        loanInterestOf: { select: { id: true } },
      },
    });
    if (linked?.goalContribution) {
      throw new UserFacingError("This transfer belongs to a savings goal contribution. Delete it from the goal.");
    }
    if (linked?.loanPrincipalOf || linked?.loanInterestOf) {
      throw new UserFacingError("This is part of a loan payment. Delete the payment from Debts to remove both parts.");
    }
    // Deleting a bill payment puts the bill back to unpaid.
    if (linked?.billOccurrence) {
      await tx.billOccurrence.update({
        where: { id: linked.billOccurrence.id },
        data: { state: "PENDING", paidAt: null, transactionId: null },
      });
    }
    await removeTransactionTx(tx, ctx, id);
    return { id };
  });
}

// ───────────────────────────── Exchange rates ─────────────────────────────

export async function recordExchangeRate(ctx: Ctx, input: { currency: string; date: string; rate: string }) {
  if (input.currency === ctx.baseCurrency) throw new UserFacingError("That’s already your base currency.", "currency");
  if (!toMoney(input.rate).greaterThan(0)) throw new UserFacingError("Rate must be greater than zero.", "rate");
  const date = dayToDb(input.date);
  const rate = await db.exchangeRate.upsert({
    where: { userId_currency_date: { userId: ctx.userId, currency: input.currency, date } },
    create: { userId: ctx.userId, currency: input.currency, date, rate: input.rate },
    update: { rate: input.rate },
  });
  return { id: rate.id };
}

export async function deleteExchangeRate(ctx: Ctx, id: string) {
  const { count } = await db.exchangeRate.deleteMany({ where: { id, userId: ctx.userId } });
  if (count === 0) throw new UserFacingError("Rate not found.");
  return { id };
}
