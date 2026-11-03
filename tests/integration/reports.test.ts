import { afterAll, afterEach, describe, expect, it } from "vitest";
import { transactionFormSchema, type TransactionFormInput } from "@/features/transactions/schemas";
import { db } from "@/server/db";
import { getReport } from "@/server/queries/reports.query";
import { createAccount } from "@/server/services/accounts.service";
import { createTransaction } from "@/server/services/transactions.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const bank = (await createAccount(userId, accountValues({ name: "Bank", openingBalance: "100000", openingDate: "2026-08-01" }))).id;
  const cash = (await db.account.findFirstOrThrow({ where: { userId, name: "Cash" } })).id;
  const cat = async (name: string) => (await db.category.findFirstOrThrow({ where: { userId, name } })).id;
  const tx = (v: TransactionFormInput) => createTransaction(ctx, transactionFormSchema.parse(v));
  const [salary, groceries, restaurants, rent] = await Promise.all([cat("Salary"), cat("Groceries"), cat("Restaurants"), cat("Rent")]);

  // September (comparison period)
  await tx({ type: "INCOME", accountId: bank, categoryId: salary, amount: "75000", date: "2026-09-01" });
  await tx({ type: "EXPENSE", accountId: bank, categoryId: groceries, amount: "4000", date: "2026-09-10" });
  // October (reported period)
  await tx({ type: "INCOME", accountId: bank, categoryId: salary, amount: "80000", date: "2026-10-01" });
  await tx({ type: "EXPENSE", accountId: bank, categoryId: rent, amount: "21000", date: "2026-10-02", description: "October rent" });
  await tx({ type: "EXPENSE", accountId: bank, categoryId: groceries, amount: "6000", date: "2026-10-05" });
  await tx({ type: "EXPENSE", accountId: bank, categoryId: groceries, amount: "1000", date: "2026-10-06", isRefund: true });
  await tx({ type: "EXPENSE", accountId: bank, categoryId: restaurants, amount: "2000", date: "2026-10-12" });
  await tx({ type: "TRANSFER", fromAccountId: bank, toAccountId: cash, amount: "3000", date: "2026-10-15" });
  return { userId };
}

describe("reports (D-034)", () => {
  it("summarises a period against the previous one; refunds net, transfers excluded", async () => {
    const s = await setup();
    const r = await getReport(s.userId, "BDT", { start: "2026-10-01", end: "2026-10-31" }, "2026-11-03");

    expect(r.previous).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(r.summary).toMatchObject({
      income: "80000.00",
      expenses: "28000.00", // 21,000 + (6,000 − 1,000) + 2,000
      net: "52000.00",
      savingsRate: "65.0",
      expenseToIncome: "35.0",
      avgDailySpend: "903.23", // 28,000 ÷ 31
      previousIncome: "75000.00",
      previousExpenses: "4000.00",
      incomeChangePct: "6.7",
      expensesChangePct: "600.0",
    });

    expect(r.spending.map((g) => `${g.name} ${g.amount} ${g.previous} ${g.sharePct} ${g.changePct}`)).toEqual([
      "Housing 21000.00 0.00 75.0 null",
      "Food 7000.00 4000.00 25.0 75.0",
    ]);
    expect(r.spending[1].children.map((c) => `${c.name} ${c.amount}`)).toEqual(["Groceries 5000.00", "Restaurants 2000.00"]);
    expect(r.income.map((g) => `${g.name} ${g.amount}`)).toEqual(["Salary 80000.00"]);

    expect(r.months).toEqual([{ month: "2026-10", label: "Oct 2026", income: "80000.00", expenses: "28000.00", net: "52000.00", savingsRate: "65.0" }]);
    expect(r.topExpenses[0]).toMatchObject({ description: "October rent", category: "Rent", account: "Bank", amount: "21000.00" });
    expect(r.topExpenses).toHaveLength(3); // the refund isn't an expense

    // Movement per account includes the transfer and the refund.
    expect(r.accounts.map((a) => `${a.name} ${a.moneyIn} ${a.moneyOut} ${a.net}`)).toEqual([
      "Bank 81000.00 32000.00 49000.00",
      "Cash 3000.00 0.00 3000.00",
    ]);
  });

  it("a running period is compared with the same elapsed days", async () => {
    const s = await setup();
    const r = await getReport(s.userId, "BDT", { start: "2026-10-01", end: "2026-10-31" }, "2026-10-05");
    expect(r.current).toEqual({ start: "2026-10-01", end: "2026-10-05" });
    expect(r.previous).toEqual({ start: "2026-09-01", end: "2026-09-05" });
    expect(r.summary.expenses).toBe("27000.00"); // rent + groceries so far
    expect(r.summary.previousExpenses).toBe("0.00");
    expect(r.summary.expensesChangePct).toBeNull();
  });

  it("shows only the user's own data", async () => {
    await setup();
    const other = await createTestUser();
    const r = await getReport(other, "BDT", { start: "2026-10-01", end: "2026-10-31" }, "2026-11-03");
    expect(r.summary.expenses).toBe("0.00");
    expect(r.spending).toEqual([]);
    expect(r.accounts).toEqual([]);
  });
});
