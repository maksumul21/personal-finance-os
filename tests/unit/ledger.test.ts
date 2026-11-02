import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { accountBalance, accountTotals } from "@/domain/accounts";
import {
  LedgerError,
  assertPostingInvariants,
  buildPosting,
  incomeExpenseTotals,
  type LedgerInput,
} from "@/domain/ledger";
import { savings, savingsRate } from "@/domain/metrics";
import { ZERO, sum, toMoney, type Money } from "@/domain/money";

/** Applies postings to in-memory balances, the same way the database derives them. */
function simulate(opening: Record<string, string>, inputs: LedgerInput[]) {
  const balances = new Map<string, Money>(Object.entries(opening).map(([k, v]) => [k, toMoney(v)]));
  const txs = inputs.map((input) => {
    const posting = buildPosting(input);
    assertPostingInvariants(input.type, posting.entries);
    for (const e of posting.entries) balances.set(e.accountId, (balances.get(e.accountId) ?? ZERO).plus(e.amount));
    return { type: input.type, baseAmount: posting.baseAmount, isRefund: input.type === "EXPENSE" && !!input.isRefund };
  });
  return { balances, totals: incomeExpenseTotals(txs) };
}

describe("PRD §26 golden scenarios", () => {
  it("transfer Bank → bKash moves money without touching income or expenses", () => {
    const { balances, totals } = simulate({ bank: "50000", bkash: "10000" }, [
      { type: "TRANSFER", fromAccountId: "bank", toAccountId: "bkash", amount: "5000" },
    ]);
    expect(balances.get("bank")!.toString()).toBe("45000");
    expect(balances.get("bkash")!.toString()).toBe("15000");
    expect(sum(balances.values()).toString()).toBe("60000");
    expect(totals.income.toString()).toBe("0");
    expect(totals.expenses.toString()).toBe("0");
  });

  it("income 50,000 and expenses 35,000 give savings 15,000 at 30%", () => {
    expect(savings("50000", "35000").toString()).toBe("15000");
    expect(savingsRate("50000", "35000")?.toString()).toBe("30");
    expect(savingsRate("0", "100")).toBeNull();
  });
});

describe("credit card", () => {
  it("purchase is one expense; repayment is a transfer, never a second expense", () => {
    const { balances, totals } = simulate({ bank: "20000", card: "0" }, [
      { type: "EXPENSE", accountId: "card", amount: "3000" },
      { type: "TRANSFER", fromAccountId: "bank", toAccountId: "card", amount: "3000" },
    ]);
    expect(totals.expenses.toString()).toBe("3000");
    expect(balances.get("card")!.toString()).toBe("0");
    expect(balances.get("bank")!.toString()).toBe("17000");
  });

  it("purchase raises liability and leaves the bank untouched", () => {
    const { balances } = simulate({ bank: "20000", card: "0" }, [
      { type: "EXPENSE", accountId: "card", amount: "3000" },
    ]);
    expect(balances.get("bank")!.toString()).toBe("20000");
    const totals = accountTotals([
      { type: "BANK", isArchived: false, baseBalance: balances.get("bank")! },
      { type: "CREDIT_CARD", isArchived: false, baseBalance: balances.get("card")! },
    ]);
    expect(totals.totalBalance.toString()).toBe("20000");
    expect(totals.totalLiabilities.toString()).toBe("3000");
  });
});

describe("posting rules", () => {
  it("rejects invalid amounts and same-account transfers", () => {
    expect(() => buildPosting({ type: "INCOME", accountId: "a", amount: "0" })).toThrow(LedgerError);
    expect(() => buildPosting({ type: "INCOME", accountId: "a", amount: "-1" })).toThrow(LedgerError);
    expect(() => buildPosting({ type: "INCOME", accountId: "a", amount: "1.005" })).toThrow(LedgerError);
    expect(() => buildPosting({ type: "TRANSFER", fromAccountId: "a", toAccountId: "a", amount: "1" })).toThrow(
      LedgerError,
    );
    expect(() => buildPosting({ type: "INCOME", accountId: "a", amount: "1", exchangeRate: "0" })).toThrow(LedgerError);
  });

  it("refund credits the account and reduces expenses", () => {
    const { balances, totals } = simulate({ bank: "1000" }, [
      { type: "EXPENSE", accountId: "bank", amount: "300" },
      { type: "EXPENSE", accountId: "bank", amount: "100", isRefund: true },
    ]);
    expect(balances.get("bank")!.toString()).toBe("800");
    expect(totals.expenses.toString()).toBe("200");
  });

  it("cross-currency transfer keeps each side in its own currency and nets to zero in base", () => {
    const p = buildPosting({
      type: "TRANSFER",
      fromAccountId: "usd",
      toAccountId: "bdt",
      amount: "100",
      toAmount: "12150",
      exchangeRate: "121.5",
    });
    expect(p.entries[0].amount.toString()).toBe("-100");
    expect(p.entries[1].amount.toString()).toBe("12150");
    expect(p.entries[0].baseAmount.plus(p.entries[1].baseAmount).isZero()).toBe(true);
    expect(p.baseAmount.toString()).toBe("12150");
  });

  it("account balance = opening + entries", () => {
    expect(accountBalance("1000.50", ["-200.25", "50"]).toString()).toBe("850.25");
  });

  it("archived and investment accounts are excluded from total balance; unconverted are counted", () => {
    const totals = accountTotals([
      { type: "BANK", isArchived: false, baseBalance: "100" },
      { type: "BANK", isArchived: true, baseBalance: "999" },
      { type: "INVESTMENT", isArchived: false, baseBalance: "500" },
      { type: "CASH", isArchived: false, baseBalance: null },
    ]);
    expect(totals.totalBalance.toString()).toBe("100");
    expect(totals.unconvertedCount).toBe(1);
  });

  it("net worth keeps money moved into an investment account and subtracts debt", () => {
    // Bank 100 000 → transfer 40 000 to an investment account; card owes 5 000.
    const totals = accountTotals([
      { type: "BANK", isArchived: false, baseBalance: "60000" },
      { type: "INVESTMENT", isArchived: false, baseBalance: "40000" },
      { type: "CREDIT_CARD", isArchived: false, baseBalance: "-5000" },
      { type: "SAVINGS", isArchived: true, baseBalance: "999" },
    ]);
    expect(totals.totalBalance.toString()).toBe("60000");
    expect(totals.totalLiabilities.toString()).toBe("5000");
    expect(totals.netWorth.toString()).toBe("95000");
  });
});

describe("ledger invariants (property-based)", () => {
  const accounts = ["bank", "bkash", "cash", "card"] as const;
  const amountArb = fc.integer({ min: 1, max: 10_000_000 }).map((cents) => (cents / 100).toFixed(2));
  const accountArb = fc.constantFrom(...accounts);
  const inputArb: fc.Arbitrary<LedgerInput> = fc.oneof(
    fc.record({ type: fc.constant("INCOME" as const), accountId: accountArb, amount: amountArb }),
    fc.record({
      type: fc.constant("EXPENSE" as const),
      accountId: accountArb,
      amount: amountArb,
      isRefund: fc.boolean(),
    }),
    fc
      .tuple(accountArb, accountArb, amountArb)
      .filter(([a, b]) => a !== b)
      .map(([from, to, amount]) => ({ type: "TRANSFER" as const, fromAccountId: from, toAccountId: to, amount })),
  );

  it("Σ balances changes by exactly income − expenses; transfers are neutral", () => {
    fc.assert(
      fc.property(fc.array(inputArb, { maxLength: 60 }), (inputs) => {
        const opening = { bank: "50000", bkash: "10000", cash: "0", card: "0" };
        const { balances, totals } = simulate(opening, inputs);
        const delta = sum(balances.values()).minus(sum(Object.values(opening)));
        expect(delta.equals(totals.income.minus(totals.expenses))).toBe(true);
      }),
    );
  });

  it("transfers alone never change income, expenses or total holdings", () => {
    const transferArb = fc
      .tuple(accountArb, accountArb, amountArb)
      .filter(([a, b]) => a !== b)
      .map(([from, to, amount]): LedgerInput => ({ type: "TRANSFER", fromAccountId: from, toAccountId: to, amount }));
    fc.assert(
      fc.property(fc.array(transferArb, { maxLength: 40 }), (inputs) => {
        const { balances, totals } = simulate({ bank: "100", bkash: "0", cash: "0", card: "0" }, inputs);
        expect(totals.income.isZero() && totals.expenses.isZero()).toBe(true);
        expect(sum(balances.values()).toString()).toBe("100");
      }),
    );
  });

  it("every posting satisfies the structural invariants", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const p = buildPosting(input);
        expect(() => assertPostingInvariants(input.type, p.entries)).not.toThrow();
        expect(p.amount.isPositive() && p.baseAmount.isPositive()).toBe(true);
      }),
    );
  });
});
