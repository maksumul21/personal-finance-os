import "server-only";
import { accountBalance, accountNature, accountTotals, type AccountNature, type AccountType } from "@/domain/accounts";
import { pickRate, toBase } from "@/domain/fx";
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
  /** Signed, base currency using the latest recorded rate; null when no rate exists. */
  baseBalance: string | null;
  creditLimit: string | null;
  transactionCount: number;
}

export interface AccountsOverview {
  accounts: AccountDTO[];
  baseCurrency: string;
  totals: {
    totalBalance: string;
    totalLiabilities: string;
    netWorth: string;
    unconvertedCount: number;
  };
}

/**
 * Every account with its derived balance (opening + Σ ledger entries), aggregated in SQL.
 * Foreign-currency balances convert at the latest recorded rate; without one they stay unconverted.
 */
export async function getAccountsOverview(userId: string, baseCurrency: string): Promise<AccountsOverview> {
  const [accounts, sums, rates] = await Promise.all([
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
    db.exchangeRate.findMany({ where: { userId }, select: { currency: true, date: true, rate: true } }),
  ]);
  const recorded = rates.map((r) => ({ currency: r.currency, date: dbToDay(r.date), rate: r.rate }));
  const byAccount = new Map(sums.map((s) => [s.accountId, s]));

  const dtos: AccountDTO[] = accounts.map((a) => {
    const agg = byAccount.get(a.id);
    const balance = accountBalance(a.openingBalance, agg?._sum.amount ? [agg._sum.amount] : []);
    const baseBalance = toBase(balance, a.currency, baseCurrency, pickRate(recorded, a.currency, "9999-12-31"));
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
      baseBalance: baseBalance ? toMoneyString(baseBalance) : null,
      creditLimit: a.creditLimit ? toMoneyString(a.creditLimit) : null,
      transactionCount: agg?._count._all ?? 0,
    };
  });

  const totals = accountTotals(
    dtos.map((a) => ({
      type: a.type,
      isArchived: a.isArchived,
      baseBalance: a.baseBalance,
    })),
  );

  return {
    accounts: dtos,
    baseCurrency,
    totals: {
      totalBalance: toMoneyString(totals.totalBalance),
      totalLiabilities: toMoneyString(totals.totalLiabilities),
      netWorth: toMoneyString(totals.netWorth),
      unconvertedCount: totals.unconvertedCount,
    },
  };
}
