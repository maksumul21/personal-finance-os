import { ZERO, sum, toMoney, type Money, type MoneyInput } from "./money";

export const ACCOUNT_TYPES = [
  "CASH",
  "BANK",
  "SAVINGS",
  "MFS",
  "CREDIT_CARD",
  "LOAN",
  "INVESTMENT",
  "OTHER_ASSET",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type AccountNature = "ASSET" | "LIABILITY";

const LIABILITY_TYPES: ReadonlySet<AccountType> = new Set(["CREDIT_CARD", "LOAN"]);

export function accountNature(type: AccountType): AccountNature {
  return LIABILITY_TYPES.has(type) ? "LIABILITY" : "ASSET";
}

/** Accounts whose value comes from holdings at market value, not from the ledger (net worth). */
export function isMarkedToMarket(type: AccountType): boolean {
  return type === "INVESTMENT";
}

/**
 * Balance in the account's own currency.
 * Current Balance = Opening Balance + Σ signed ledger entries (PRD §7.3, ARCHITECTURE.md).
 */
export function accountBalance(openingBalance: MoneyInput, entryAmounts: Iterable<MoneyInput>): Money {
  return toMoney(openingBalance).plus(sum(entryAmounts));
}

/** For liabilities, outstanding amount owed = −balance (never below zero when in credit). */
export function liabilityOutstanding(balance: MoneyInput): Money {
  const b = toMoney(balance);
  return b.isNegative() ? b.negated() : ZERO;
}

export interface AccountBalanceRow {
  type: AccountType;
  isArchived: boolean;
  /** Balance already converted to the base currency, or null when no rate is recorded. */
  baseBalance: MoneyInput | null;
  /** Market value in the base currency (investment accounts, D-029); defaults to baseBalance. */
  baseValue?: MoneyInput | null;
}

export interface AccountTotals {
  /** PRD §4.1 Total Balance: active asset accounts, excluding investment containers. */
  totalBalance: Money;
  totalLiabilities: Money;
  /**
   * Σ signed values of every active account: investment accounts at market value (ledger
   * balance + realised and unrealised gains, D-029), everything else at its balance.
   */
  netWorth: Money;
  /** Active accounts whose balance could not be converted to the base currency. */
  unconvertedCount: number;
}

export function accountTotals(rows: Iterable<AccountBalanceRow>): AccountTotals {
  let totalBalance = ZERO;
  let totalLiabilities = ZERO;
  let netWorth = ZERO;
  let unconvertedCount = 0;
  for (const row of rows) {
    if (row.isArchived) continue;
    if (row.baseBalance === null) {
      unconvertedCount++;
      continue;
    }
    netWorth = netWorth.plus(toMoney(row.baseValue ?? row.baseBalance));
    if (accountNature(row.type) === "LIABILITY") {
      totalLiabilities = totalLiabilities.plus(liabilityOutstanding(row.baseBalance));
      // A card in credit (positive balance) is money you hold.
      const b = toMoney(row.baseBalance);
      if (b.isPositive()) totalBalance = totalBalance.plus(b);
    } else if (!isMarkedToMarket(row.type)) {
      totalBalance = totalBalance.plus(toMoney(row.baseBalance));
    }
  }
  return { totalBalance, totalLiabilities, netWorth, unconvertedCount };
}
