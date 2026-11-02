import "server-only";
import { accountNature, isMarkedToMarket } from "@/domain/accounts";
import { emergencyTarget, savedAmount } from "@/domain/goals";
import { toMoney } from "@/domain/money";
import { dayToDb } from "@/domain/period";
import type { ContributionValues, GoalFormValues } from "@/features/goals/schemas";
import { transactionFormSchema } from "@/features/transactions/schemas";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";
import { postTransactionTx, removeTransactionTx } from "./transactions.service";

interface Ctx {
  userId: string;
  baseCurrency: string;
}

async function ownedGoal(tx: DbTx, userId: string, id: string) {
  const goal = await tx.savingsGoal.findFirst({ where: { id, userId }, include: { linkedAccount: true } });
  if (!goal) throw new UserFacingError("Goal not found.");
  return goal;
}

/** A goal's money must sit in an active asset account (not a card, loan or investment container). */
async function checkLinkedAccount(tx: DbTx, userId: string, accountId: string | undefined) {
  if (!accountId) return null;
  const account = await tx.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new UserFacingError("Account not found.", "linkedAccountId");
  if (account.isArchived) throw new UserFacingError(`“${account.name}” is archived.`, "linkedAccountId");
  if (accountNature(account.type) === "LIABILITY" || isMarkedToMarket(account.type)) {
    throw new UserFacingError("Savings must be kept in a cash, bank, savings or wallet account.", "linkedAccountId");
  }
  return account;
}

function goalData(values: GoalFormValues) {
  const isEmergency = values.goalType === "EMERGENCY_FUND";
  return {
    name: values.name,
    goalType: values.goalType,
    targetAmount: isEmergency
      ? emergencyTarget(values.essentialMonthly!, values.targetMonths!).toFixed(2)
      : values.targetAmount!,
    targetDate: values.targetDate ? dayToDb(values.targetDate) : null,
    description: values.description || null,
    icon: values.icon,
    color: values.color,
    priority: values.priority,
    linkedAccountId: values.linkedAccountId || null,
    essentialMonthly: isEmergency ? values.essentialMonthly : null,
    targetMonths: isEmergency ? values.targetMonths! : null,
  };
}

export async function createGoal(userId: string, values: GoalFormValues) {
  return db.$transaction(async (tx) => {
    await checkLinkedAccount(tx, userId, values.linkedAccountId || undefined);
    const goal = await tx.savingsGoal.create({ data: { userId, ...goalData(values) } });
    await audit(tx, userId, "goal.create", "SavingsGoal", goal.id, undefined, values);
    return { id: goal.id };
  });
}

export async function updateGoal(userId: string, id: string, values: GoalFormValues) {
  return db.$transaction(async (tx) => {
    const before = await ownedGoal(tx, userId, id);
    const newLinked = values.linkedAccountId || null;
    if (newLinked !== before.linkedAccountId) {
      // Past transfers went into the old account; moving the goal would misstate where the money is.
      const moved = await tx.goalContribution.count({ where: { goalId: id, transactionId: { not: null } } });
      if (moved > 0) {
        throw new UserFacingError("This goal has transfers into its account, so the account can't change.", "linkedAccountId");
      }
      await checkLinkedAccount(tx, userId, newLinked ?? undefined);
    }
    await tx.savingsGoal.update({ where: { id: before.id }, data: goalData(values) });
    await audit(tx, userId, "goal.update", "SavingsGoal", id, before, values);
    return { id };
  });
}

export async function setGoalArchived(userId: string, id: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    const before = await ownedGoal(tx, userId, id);
    await tx.savingsGoal.update({ where: { id: before.id }, data: { status: archived ? "ARCHIVED" : "ACTIVE" } });
    await audit(tx, userId, archived ? "goal.archive" : "goal.unarchive", "SavingsGoal", id);
    return { id };
  });
}

/**
 * Deletes the goal and its contribution records. Money already transferred stays where it is:
 * those transfers remain in the ledger as ordinary transfers.
 */
export async function deleteGoal(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const before = await ownedGoal(tx, userId, id);
    await tx.savingsGoal.delete({ where: { id: before.id } });
    await audit(tx, userId, "goal.delete", "SavingsGoal", id, before);
    return { id };
  });
}

async function currentSaved(tx: DbTx, goalId: string, excludeId?: string) {
  const rows = await tx.goalContribution.findMany({
    where: { goalId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { direction: true, amount: true },
  });
  return savedAmount(rows);
}

/** Builds the transfer behind a contribution: into the goal's account, or out of it. */
function transferFor(goal: { name: string; linkedAccountId: string | null }, c: { direction: string; amount: string; date: string; notes: string }, otherAccountId: string) {
  const deposit = c.direction === "DEPOSIT";
  return transactionFormSchema.parse({
    type: "TRANSFER",
    fromAccountId: deposit ? otherAccountId : goal.linkedAccountId,
    toAccountId: deposit ? goal.linkedAccountId : otherAccountId,
    amount: c.amount,
    date: c.date,
    description: `${deposit ? "Savings" : "Withdrawal"}: ${goal.name}`,
    notes: c.notes,
  });
}

export async function addContribution(ctx: Ctx, values: ContributionValues) {
  return db.$transaction(async (tx) => {
    const goal = await ownedGoal(tx, ctx.userId, values.goalId);
    if (goal.status === "ARCHIVED") throw new UserFacingError("Restore the goal to add contributions.");
    if (values.direction === "WITHDRAWAL") {
      const saved = await currentSaved(tx, goal.id);
      if (toMoney(values.amount).greaterThan(saved)) {
        throw new UserFacingError(`You can withdraw at most ${saved.toFixed(2)} from this goal.`, "amount");
      }
    }

    let transactionId: string | null = null;
    if (values.accountId) {
      if (!goal.linkedAccountId) {
        throw new UserFacingError("Link this goal to an account to move money into it.", "accountId");
      }
      if (values.accountId === goal.linkedAccountId) {
        throw new UserFacingError("Choose a different account from the goal's own account.", "accountId");
      }
      const posted = await postTransactionTx(tx, ctx, transferFor(goal, values, values.accountId), { source: "GOAL" });
      transactionId = posted.id;
    }

    const c = await tx.goalContribution.create({
      data: {
        goalId: goal.id,
        userId: ctx.userId,
        direction: values.direction,
        amount: values.amount,
        date: dayToDb(values.date),
        notes: values.notes || null,
        transactionId,
      },
    });
    await audit(tx, ctx.userId, "goal.contribution.create", "GoalContribution", c.id, undefined, values);
    return { id: c.id };
  });
}

/** Changes amount/date/notes; a linked transfer is re-posted so the ledger matches. */
export async function updateContribution(ctx: Ctx, input: { id: string; amount: string; date: string; notes: string }) {
  return db.$transaction(async (tx) => {
    const c = await tx.goalContribution.findFirst({
      where: { id: input.id, userId: ctx.userId },
      include: { goal: true, transaction: { include: { entries: true } } },
    });
    if (!c) throw new UserFacingError("Contribution not found.");

    const savedWithout = await currentSaved(tx, c.goalId, c.id);
    const after = c.direction === "DEPOSIT" ? savedWithout.plus(toMoney(input.amount)) : savedWithout.minus(toMoney(input.amount));
    if (after.isNegative()) throw new UserFacingError("That would take the goal below zero.", "amount");

    let transactionId = c.transactionId;
    if (c.transaction) {
      // The "other" account is whichever side isn't the goal's account.
      const other = c.transaction.entries.find((e) => e.accountId !== c.goal.linkedAccountId)!.accountId;
      await tx.goalContribution.update({ where: { id: c.id }, data: { transactionId: null } });
      await removeTransactionTx(tx, ctx, c.transaction.id);
      const posted = await postTransactionTx(tx, ctx, transferFor(c.goal, { ...input, direction: c.direction }, other), { source: "GOAL" });
      transactionId = posted.id;
    }
    await tx.goalContribution.update({
      where: { id: c.id },
      data: { amount: input.amount, date: dayToDb(input.date), notes: input.notes || null, transactionId },
    });
    await audit(tx, ctx.userId, "goal.contribution.update", "GoalContribution", c.id, c, input);
    return { id: c.id };
  });
}

/** Deleting a contribution also reverses its transfer, putting the money back. */
export async function deleteContribution(ctx: Ctx, id: string) {
  return db.$transaction(async (tx) => {
    const c = await tx.goalContribution.findFirst({ where: { id, userId: ctx.userId } });
    if (!c) throw new UserFacingError("Contribution not found.");
    if (c.direction === "DEPOSIT") {
      const savedWithout = await currentSaved(tx, c.goalId, c.id);
      if (savedWithout.isNegative()) {
        throw new UserFacingError("Later withdrawals depend on this deposit. Delete those first.");
      }
    }
    await tx.goalContribution.delete({ where: { id: c.id } });
    if (c.transactionId) await removeTransactionTx(tx, ctx, c.transactionId);
    await audit(tx, ctx.userId, "goal.contribution.delete", "GoalContribution", id, c);
    return { id };
  });
}
