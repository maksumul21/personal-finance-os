import "server-only";
import { accountNature } from "@/domain/accounts";
import { toMoney } from "@/domain/money";
import { dayToDb } from "@/domain/period";
import type { AccountFormValues } from "@/features/accounts/schemas";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db } from "../db";

/** Liabilities are entered as "amount owed" and stored negative (ledger sign convention). */
function storedOpeningBalance(values: AccountFormValues): string {
  const amount = toMoney(values.openingBalance);
  return accountNature(values.type) === "LIABILITY" ? amount.abs().negated().toFixed(2) : amount.toFixed(2);
}

function accountData(values: AccountFormValues) {
  return {
    name: values.name,
    type: values.type,
    provider: values.type === "MFS" ? (values.provider ?? null) : null,
    currency: values.currency,
    openingBalance: storedOpeningBalance(values),
    openingDate: dayToDb(values.openingDate),
    creditLimit: values.type === "CREDIT_CARD" ? (values.creditLimit ?? null) : null,
    color: values.color,
    icon: values.icon,
    description: values.description || null,
    includeInSafeToSpend: accountNature(values.type) === "ASSET" ? values.includeInSafeToSpend : false,
  };
}

export async function createAccount(userId: string, values: AccountFormValues) {
  return db.$transaction(async (tx) => {
    const count = await tx.account.count({ where: { userId } });
    const account = await tx.account.create({ data: { userId, sortOrder: count, ...accountData(values) } });
    await audit(tx, userId, "account.create", "Account", account.id, undefined, account);
    return { id: account.id };
  });
}

export async function updateAccount(userId: string, id: string, values: AccountFormValues) {
  return db.$transaction(async (tx) => {
    const existing = await tx.account.findFirst({ where: { id, userId } });
    if (!existing) throw new UserFacingError("Account not found.");

    const hasEntries = (await tx.ledgerEntry.count({ where: { accountId: id, userId } })) > 0;
    if (hasEntries && existing.currency !== values.currency) {
      throw new UserFacingError("Currency can't change once the account has transactions.", "currency");
    }
    if (hasEntries && accountNature(existing.type) !== accountNature(values.type)) {
      throw new UserFacingError(
        "An account with transactions can't switch between asset and liability types.",
        "type",
      );
    }
    const updated = await tx.account.update({ where: { id: existing.id }, data: accountData(values) });
    await audit(tx, userId, "account.update", "Account", id, existing, updated);
    return { id };
  });
}

/** Archived accounts keep their history but drop out of active summaries (PRD §25). */
export async function setAccountArchived(userId: string, id: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.account.updateMany({ where: { id, userId }, data: { isArchived: archived } });
    if (count === 0) throw new UserFacingError("Account not found.");
    await audit(tx, userId, archived ? "account.archive" : "account.unarchive", "Account", id);
    return { id };
  });
}

/** Hard delete is only allowed for accounts that never had a transaction; otherwise archive. */
export async function deleteAccount(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.account.findFirst({ where: { id, userId } });
    if (!existing) throw new UserFacingError("Account not found.");
    if ((await tx.ledgerEntry.count({ where: { accountId: id, userId } })) > 0) {
      throw new UserFacingError("This account has transactions. Archive it instead to keep your history.");
    }
    const [rules, bills] = await Promise.all([
      tx.recurringRule.count({ where: { userId, OR: [{ accountId: id }, { toAccountId: id }] } }),
      tx.bill.count({ where: { userId, paymentAccountId: id } }),
    ]);
    if (rules + bills > 0) {
      throw new UserFacingError("A recurring transaction or bill uses this account. Change or delete those first.");
    }
    await tx.account.delete({ where: { id: existing.id } });
    await audit(tx, userId, "account.delete", "Account", id, existing);
    return { id };
  });
}
