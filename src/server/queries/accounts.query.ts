import "server-only";
import { accountBalance, accountNature, accountTotals, type AccountNature, type AccountType } from "@/domain/accounts";
import { toMoneyString } from "@/domain/money";
import { dbToDay, type Day } from "@/domain/period";
import { db } from "../db";

export interface AccountDTO {
  id: string;
  name: string;
  type: AccountType;
  nature: AccountNature;
  provider: string | null;
  currency: string;
  color: string;
  icon: string;
  description: string | null;
  isArchived: boolean;
  includeInSafeToSpend: boolean;
  openingDate: Day;
  /** Signed, account currency. */
  openingBalance: string;
  /** Signed, account currency. Liabilities are negative when money is owed. */
  balance: string;
  creditLimit: string | null;
  transactionCount: number;
}

export interface AccountsOverview {
  accounts: AccountDTO[];
  baseCurrency: string;
  totals: {
    totalBalance: string;
    totalLiabilities: string;
    unconvertedCount: number;
  };
}

/**
 * Every account with its derived balance (opening + Σ ledger entries), aggregated in SQL.
 * Foreign-currency balances are reported as unconverted until exchange rates exist (Phase 2).
 */
export async function getAccountsOverview(userId: string, baseCurrency: string): Promise<AccountsOverview> {
  const [accounts, sums] = await Promise.all([
    db.account.findMany({
      where: { userId },
      orderBy: [{ isArchived: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.ledgerEntry.groupBy({
      by: ["accountId"],
      where: { userId },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const byAccount = new Map(sums.map((s) => [s.accountId, s]));

  const dtos: AccountDTO[] = accounts.map((a) => {
    const agg = byAccount.get(a.id);
    const balance = accountBalance(a.openingBalance, agg?._sum.amount ? [agg._sum.amount] : []);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      nature: accountNature(a.type),
      provider: a.provider,
      currency: a.currency,
      color: a.color,
      icon: a.icon,
      description: a.description,
      isArchived: a.isArchived,
      includeInSafeToSpend: a.includeInSafeToSpend,
      openingDate: dbToDay(a.openingDate),
      openingBalance: toMoneyString(a.openingBalance),
      balance: toMoneyString(balance),
      creditLimit: a.creditLimit ? toMoneyString(a.creditLimit) : null,
      transactionCount: agg?._count._all ?? 0,
    };
  });

  const totals = accountTotals(
    dtos.map((a) => ({
      type: a.type,
      isArchived: a.isArchived,
      baseBalance: a.currency === baseCurrency ? a.balance : null,
    })),
  );

  return {
    accounts: dtos,
    baseCurrency,
    totals: {
      totalBalance: toMoneyString(totals.totalBalance),
      totalLiabilities: toMoneyString(totals.totalLiabilities),
      unconvertedCount: totals.unconvertedCount,
    },
  };
}
