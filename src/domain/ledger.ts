import { MAX_AMOUNT, ZERO, round2, toMoney, type Money, type MoneyInput } from "./money";

/**
 * Posting rules: turns a user-facing transaction into signed ledger entries.
 * Pure and deterministic; services persist the result inside one DB transaction.
 * See docs/ARCHITECTURE.md › Ledger model.
 */

export type LedgerInput =
  | {
      type: "INCOME";
      accountId: string;
      amount: MoneyInput;
      exchangeRate?: MoneyInput;
    }
  | {
      type: "EXPENSE";
      accountId: string;
      amount: MoneyInput;
      exchangeRate?: MoneyInput;
      /** A refund puts money back into the account and reduces category spending. */
      isRefund?: boolean;
    }
  | {
      type: "TRANSFER";
      fromAccountId: string;
      toAccountId: string;
      /** Amount leaving the source account, in the source currency. */
      amount: MoneyInput;
      /** Amount arriving, in the destination currency. Defaults to `amount` (same currency). */
      toAmount?: MoneyInput;
      exchangeRate?: MoneyInput;
    };

export interface LedgerEntryDraft {
  accountId: string;
  amount: Money;
  baseAmount: Money;
}

export interface PostingResult {
  /** Positive, in the source currency. */
  amount: Money;
  exchangeRate: Money;
  /** Positive, in the base currency. */
  baseAmount: Money;
  entries: LedgerEntryDraft[];
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

function positive(value: MoneyInput, label: string): Money {
  const v = toMoney(value);
  if (!v.isFinite() || v.lessThanOrEqualTo(0)) throw new LedgerError(`${label} must be greater than zero`);
  if (v.greaterThan(MAX_AMOUNT)) throw new LedgerError(`${label} is too large`);
  if (v.decimalPlaces() > 2) throw new LedgerError(`${label} can have at most 2 decimal places`);
  return v;
}

function rate(value: MoneyInput | undefined): Money {
  const r = toMoney(value ?? 1);
  if (!r.isFinite() || r.lessThanOrEqualTo(0)) throw new LedgerError("Exchange rate must be greater than zero");
  return r;
}

export function buildPosting(input: LedgerInput): PostingResult {
  const amount = positive(input.amount, "Amount");
  const exchangeRate = rate(input.exchangeRate);
  const baseAmount = round2(amount.times(exchangeRate));

  switch (input.type) {
    case "INCOME":
      return {
        amount,
        exchangeRate,
        baseAmount,
        entries: [{ accountId: input.accountId, amount, baseAmount }],
      };
    case "EXPENSE": {
      const sign = input.isRefund ? 1 : -1;
      return {
        amount,
        exchangeRate,
        baseAmount,
        entries: [{ accountId: input.accountId, amount: amount.times(sign), baseAmount: baseAmount.times(sign) }],
      };
    }
    case "TRANSFER": {
      if (input.fromAccountId === input.toAccountId) {
        throw new LedgerError("Source and destination accounts must be different");
      }
      const toAmount = input.toAmount === undefined ? amount : positive(input.toAmount, "Received amount");
      return {
        amount,
        exchangeRate,
        baseAmount,
        entries: [
          { accountId: input.fromAccountId, amount: amount.negated(), baseAmount: baseAmount.negated() },
          { accountId: input.toAccountId, amount: toAmount, baseAmount },
        ],
      };
    }
  }
}

/**
 * Invariant check used by services before persisting and by tests.
 * Throws if a posting would break the ledger rules.
 */
export function assertPostingInvariants(type: LedgerInput["type"], entries: LedgerEntryDraft[]): void {
  if (type === "TRANSFER") {
    if (entries.length !== 2) throw new LedgerError("A transfer must have exactly two entries");
    const [a, b] = entries;
    if (a.accountId === b.accountId) throw new LedgerError("A transfer must move between two accounts");
    if (!a.baseAmount.plus(b.baseAmount).equals(ZERO)) {
      throw new LedgerError("Transfer entries must net to zero in the base currency");
    }
    if (a.amount.isPositive() === b.amount.isPositive()) {
      throw new LedgerError("A transfer must debit one account and credit the other");
    }
  } else if (entries.length !== 1) {
    throw new LedgerError("Income and expense must have exactly one entry");
  }
  for (const e of entries) {
    if (e.amount.isZero()) throw new LedgerError("Ledger entries cannot be zero");
  }
}

export interface TxForTotals {
  type: LedgerInput["type"];
  baseAmount: MoneyInput;
  isRefund?: boolean;
}

/** Income and expense totals. Transfers never count (PRD §5.1, §21). Refunds reduce expenses. */
export function incomeExpenseTotals(txs: Iterable<TxForTotals>): { income: Money; expenses: Money } {
  let income = ZERO;
  let expenses = ZERO;
  for (const tx of txs) {
    const amt = toMoney(tx.baseAmount);
    if (tx.type === "INCOME") income = income.plus(amt);
    else if (tx.type === "EXPENSE") expenses = tx.isRefund ? expenses.minus(amt) : expenses.plus(amt);
  }
  return { income, expenses };
}
