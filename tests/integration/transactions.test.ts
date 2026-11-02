import { afterAll, afterEach, describe, expect, it } from "vitest";
import { transactionFormSchema, type TransactionFormInput } from "@/features/transactions/schemas";
import { UserFacingError } from "@/server/action";
import { db } from "@/server/db";
import { getAccountsOverview } from "@/server/queries/accounts.query";
import { getTransactionPage } from "@/server/queries/transactions.query";
import { createAccount, setAccountArchived } from "@/server/services/accounts.service";
import {
  createTransaction,
  deleteTransaction,
  recordExchangeRate,
  updateTransaction,
} from "@/server/services/transactions.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

const parse = (v: TransactionFormInput) => transactionFormSchema.parse(v);

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const bank = await createAccount(userId, accountValues({ name: "Bank", openingBalance: "50000" }));
  const bkash = await createAccount(userId, accountValues({ name: "bKash", type: "MFS", provider: "BKASH", openingBalance: "10000" }));
  const card = await createAccount(userId, accountValues({ name: "Card", type: "CREDIT_CARD", openingBalance: "0" }));
  const cat = async (name: string) => db.category.findFirstOrThrow({ where: { userId, name } });
  return { userId, ctx, bank: bank.id, bkash: bkash.id, card: card.id, cat };
}

async function balances(userId: string) {
  const o = await getAccountsOverview(userId, "BDT");
  const byName: Record<string, string> = Object.fromEntries(o.accounts.map((a) => [a.name, a.balance]));
  return Object.assign(byName, { totals: o.totals }) as Record<string, string> & { totals: typeof o.totals };
}

async function monthTotals(userId: string) {
  const p = await getTransactionPage(userId, { sort: "date_desc", page: 1, from: "2026-11-01", to: "2026-11-30" });
  return p.summary;
}

describe("transaction service", () => {
  it("PRD §26: transfer Bank → bKash moves money and leaves income/expenses unchanged", async () => {
    const s = await setup();
    await createTransaction(s.ctx, parse({ type: "TRANSFER", fromAccountId: s.bank, toAccountId: s.bkash, amount: "5,000", date: "2026-11-02" }));
    const b = await balances(s.userId);
    expect([b.Bank, b.bKash]).toEqual(["45000.00", "15000.00"]);
    expect(b.totals.totalBalance).toBe("60000.00");
    const t = await monthTotals(s.userId);
    expect([t.income, t.expenses]).toEqual(["0.00", "0.00"]);
  });

  it("PRD §26: income 50,000 and expenses 35,000 give savings 15,000", async () => {
    const s = await setup();
    const salary = await s.cat("Salary");
    const rent = await s.cat("Rent");
    await createTransaction(s.ctx, parse({ type: "INCOME", accountId: s.bank, categoryId: salary.id, amount: "50000", date: "2026-11-01" }));
    await createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.bank, categoryId: rent.id, amount: "35000", date: "2026-11-03" }));
    const t = await monthTotals(s.userId);
    expect([t.income, t.expenses, t.net]).toEqual(["50000.00", "35000.00", "15000.00"]);
    expect((await balances(s.userId)).Bank).toBe("65000.00");
  });

  it("credit card: purchase is one expense, repayment is a transfer, liability returns to zero", async () => {
    const s = await setup();
    const groceries = await s.cat("Groceries");
    await createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.card, categoryId: groceries.id, amount: "3000", date: "2026-11-02" }));
    let b = await balances(s.userId);
    expect(b.Card).toBe("-3000.00");
    expect(b.Bank).toBe("50000.00");
    expect(b.totals.totalLiabilities).toBe("3000.00");

    await createTransaction(s.ctx, parse({ type: "TRANSFER", fromAccountId: s.bank, toAccountId: s.card, amount: "3000", date: "2026-11-05" }));
    b = await balances(s.userId);
    expect(b.Card).toBe("0.00");
    expect(b.Bank).toBe("47000.00");
    expect((await monthTotals(s.userId)).expenses).toBe("3000.00");
  });

  it("editing replaces the postings; deleting restores balances", async () => {
    const s = await setup();
    const food = await s.cat("Restaurants");
    const { id } = await createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.bank, categoryId: food.id, amount: "1200", date: "2026-11-02", tags: ["dinner"] }));
    await updateTransaction(s.ctx, id, parse({ type: "EXPENSE", accountId: s.bkash, categoryId: food.id, amount: "800", date: "2026-11-02", tags: ["dinner", "friends"] }));
    let b = await balances(s.userId);
    expect([b.Bank, b.bKash]).toEqual(["50000.00", "9200.00"]);
    expect(await db.ledgerEntry.count({ where: { transactionId: id } })).toBe(1);

    // An expense can become a transfer: category is dropped, two entries created.
    await updateTransaction(s.ctx, id, parse({ type: "TRANSFER", fromAccountId: s.bkash, toAccountId: s.bank, amount: "800", date: "2026-11-02" }));
    expect(await db.ledgerEntry.count({ where: { transactionId: id } })).toBe(2);
    expect((await monthTotals(s.userId)).expenses).toBe("0.00");

    await deleteTransaction(s.ctx, id);
    b = await balances(s.userId);
    expect([b.Bank, b.bKash]).toEqual(["50000.00", "10000.00"]);
    expect(await db.ledgerEntry.count({ where: { transactionId: id } })).toBe(0);
  });

  it("refunds reduce expenses and credit the account", async () => {
    const s = await setup();
    const shopping = await s.cat("Shopping");
    await createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.bank, categoryId: shopping.id, amount: "2000", date: "2026-11-02" }));
    await createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.bank, categoryId: shopping.id, amount: "500", isRefund: true, date: "2026-11-04" }));
    expect((await monthTotals(s.userId)).expenses).toBe("1500.00");
    expect((await balances(s.userId)).Bank).toBe("48500.00");
  });

  it("rejects wrong category kinds, archived accounts and income into a credit card", async () => {
    const s = await setup();
    const salary = await s.cat("Salary");
    const rent = await s.cat("Rent");
    await expect(
      createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.bank, categoryId: salary.id, amount: "10", date: "2026-11-02" })),
    ).rejects.toThrow(/expense category/);
    await expect(
      createTransaction(s.ctx, parse({ type: "INCOME", accountId: s.card, categoryId: salary.id, amount: "10", date: "2026-11-02" })),
    ).rejects.toThrow(/credit card/);
    await setAccountArchived(s.userId, s.bkash, true);
    await expect(
      createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.bkash, categoryId: rent.id, amount: "10", date: "2026-11-02" })),
    ).rejects.toThrow(/archived/);
  });

  it("multi-currency: requires a recorded or typed rate, converts to base, and needs the received amount", async () => {
    const s = await setup();
    const usd = await createAccount(s.userId, accountValues({ name: "Payoneer", currency: "USD", openingBalance: "1000" }));
    const freelance = await s.cat("Freelancing");

    await expect(
      createTransaction(s.ctx, parse({ type: "INCOME", accountId: usd.id, categoryId: freelance.id, amount: "200", date: "2026-11-02" })),
    ).rejects.toThrow(/exchange rate/);
    expect((await balances(s.userId)).totals.unconvertedCount).toBe(1);

    await recordExchangeRate(s.ctx, { currency: "USD", date: "2026-11-01", rate: "121.50" });
    await createTransaction(s.ctx, parse({ type: "INCOME", accountId: usd.id, categoryId: freelance.id, amount: "200", date: "2026-11-02" }));
    expect((await monthTotals(s.userId)).income).toBe("24300.00");

    await expect(
      createTransaction(s.ctx, parse({ type: "TRANSFER", fromAccountId: usd.id, toAccountId: s.bank, amount: "100", date: "2026-11-03" })),
    ).rejects.toThrow(/amount received/);
    await createTransaction(s.ctx, parse({ type: "TRANSFER", fromAccountId: usd.id, toAccountId: s.bank, amount: "100", toAmount: "12100", date: "2026-11-03" }));

    const b = await balances(s.userId);
    expect([b.Payoneer, b.Bank]).toEqual(["1100.00", "62100.00"]);
    // 1,100 USD × 121.50 = 133,650 + Bank 62,100 + bKash 10,000
    expect(b.totals.totalBalance).toBe("205750.00");
    expect(b.totals.unconvertedCount).toBe(0);
    expect((await monthTotals(s.userId)).income).toBe("24300.00");
  });

  it("never lets a user post to another user's account or category", async () => {
    const a = await setup();
    const b = await setup();
    const rentA = await a.cat("Rent");
    const rentB = await b.cat("Rent");
    await expect(
      createTransaction(b.ctx, parse({ type: "EXPENSE", accountId: a.bank, categoryId: rentB.id, amount: "1", date: "2026-11-02" })),
    ).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      createTransaction(b.ctx, parse({ type: "EXPENSE", accountId: b.bank, categoryId: rentA.id, amount: "1", date: "2026-11-02" })),
    ).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      createTransaction(b.ctx, parse({ type: "TRANSFER", fromAccountId: b.bank, toAccountId: a.bank, amount: "1", date: "2026-11-02" })),
    ).rejects.toBeInstanceOf(UserFacingError);
    const { id } = await createTransaction(a.ctx, parse({ type: "EXPENSE", accountId: a.bank, categoryId: rentA.id, amount: "1", date: "2026-11-02" }));
    await expect(deleteTransaction(b.ctx, id)).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      updateTransaction(b.ctx, id, parse({ type: "EXPENSE", accountId: b.bank, categoryId: rentB.id, amount: "1", date: "2026-11-02" })),
    ).rejects.toBeInstanceOf(UserFacingError);
    expect((await getTransactionPage(b.userId, { sort: "date_desc", page: 1 })).total).toBe(0);
  });
});

describe("transaction history query", () => {
  it("filters by group category (including subcategories), account, type, search and sorts by amount", async () => {
    const s = await setup();
    const [groceries, coffee, salary] = await Promise.all([s.cat("Groceries"), s.cat("Coffee"), s.cat("Salary")]);
    await createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.bank, categoryId: groceries.id, amount: "2400", date: "2026-11-01", description: "Shwapno" }));
    await createTransaction(s.ctx, parse({ type: "EXPENSE", accountId: s.bkash, categoryId: coffee.id, amount: "350", date: "2026-11-02", tags: ["work"] }));
    await createTransaction(s.ctx, parse({ type: "INCOME", accountId: s.bank, categoryId: salary.id, amount: "60000", date: "2026-11-02" }));
    await createTransaction(s.ctx, parse({ type: "TRANSFER", fromAccountId: s.bank, toAccountId: s.bkash, amount: "1000", date: "2026-11-02" }));

    const food = await db.category.findFirstOrThrow({ where: { userId: s.userId, name: "Food", parentId: null } });
    const byGroup = await getTransactionPage(s.userId, { sort: "amount_desc", page: 1, category: food.id });
    expect(byGroup.groups.flatMap((g) => g.transactions.map((t) => t.amount))).toEqual(["2400.00", "350.00"]);
    expect(byGroup.summary.expenses).toBe("2750.00");

    const byAccount = await getTransactionPage(s.userId, { sort: "date_desc", page: 1, account: s.bkash });
    expect(byAccount.total).toBe(2); // coffee + incoming transfer

    expect((await getTransactionPage(s.userId, { sort: "date_desc", page: 1, q: "shwap" })).total).toBe(1);
    expect((await getTransactionPage(s.userId, { sort: "date_desc", page: 1, q: "work" })).total).toBe(1);
    expect((await getTransactionPage(s.userId, { sort: "date_desc", page: 1, type: "TRANSFER" })).total).toBe(1);

    const all = await getTransactionPage(s.userId, { sort: "date_desc", page: 1 });
    expect(all.groups.map((g) => g.date)).toEqual(["2026-11-02", "2026-11-01"]);
    expect(all.groups[0].income).toBe("60000.00");
    expect(all.groups[0].expenses).toBe("350.00");
    const transfer = all.groups[0].transactions.find((t) => t.type === "TRANSFER")!;
    expect([transfer.account.name, transfer.toAccount?.name, transfer.toAmount]).toEqual(["Bank", "bKash", "1000.00"]);
  });
});
