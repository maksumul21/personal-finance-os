import { afterAll, afterEach, describe, expect, it } from "vitest";
import { billFormSchema } from "@/features/bills/schemas";
import { loanTermsSchema } from "@/features/debts/schemas";
import { goalFormSchema } from "@/features/goals/schemas";
import { recurringFormSchema, type RecurringFormInput } from "@/features/recurring/schemas";
import { toMoney } from "@/domain/money";
import { db } from "@/server/db";
import { getGoals } from "@/server/queries/goals.query";
import { getSafeToSpend } from "@/server/queries/safe-to-spend.query";
import { createAccount } from "@/server/services/accounts.service";
import { createBill } from "@/server/services/bills.service";
import { createGoal } from "@/server/services/goals.service";
import { saveLoanTerms } from "@/server/services/loans.service";
import { createRecurring } from "@/server/services/recurring.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

const TODAY = "2026-11-03";

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const acct = async (name: string, over: Parameters<typeof accountValues>[0]) => (await createAccount(userId, accountValues({ name, openingDate: "2026-10-01", ...over }))).id;
  const bank = await acct("Bank", { openingBalance: "60000" });
  const wallet = await acct("Wallet", { type: "CASH", openingBalance: "5000" });
  const savings = await acct("Savings", { type: "SAVINGS", openingBalance: "200000", includeInSafeToSpend: false });
  const card = await acct("Card", { type: "CREDIT_CARD", openingBalance: "0" });
  const cat = async (name: string) => (await db.category.findFirstOrThrow({ where: { userId, name } })).id;
  const rule = (v: Omit<RecurringFormInput, "unit" | "interval">) => createRecurring(ctx, recurringFormSchema.parse({ unit: "MONTHLY", interval: 1, ...v }), TODAY);

  await rule({ type: "INCOME", amount: "80000", accountId: bank, categoryId: await cat("Salary"), startDate: "2026-11-25", description: "Salary" });
  await rule({ type: "EXPENSE", amount: "20000", accountId: bank, categoryId: await cat("Rent"), startDate: "2026-11-20", description: "Rent" });
  await rule({ type: "TRANSFER", amount: "5000", accountId: bank, toAccountId: savings, startDate: "2026-11-10", description: "To savings" });
  await rule({ type: "TRANSFER", amount: "2000", accountId: bank, toAccountId: wallet, startDate: "2026-11-12", description: "Pocket money" }); // stays in the pool
  await createBill(ctx, billFormSchema.parse({ name: "Internet", amount: "1500", categoryId: await cat("Internet"), paymentAccountId: bank, unit: "MONTHLY", interval: 1, firstDueDate: "2026-11-15" }), TODAY);
  await createBill(ctx, billFormSchema.parse({ name: "Netflix", amount: "1100", categoryId: await cat("Internet"), paymentAccountId: card, unit: "MONTHLY", interval: 1, firstDueDate: "2026-11-16" }), TODAY); // card-paid
  const loan = await acct("Car Loan", { type: "LOAN", openingBalance: "500000" });
  await saveLoanTerms(ctx, loanTermsSchema.parse({ accountId: loan, principal: "500000", annualRate: "12", termMonths: 24, firstPaymentDate: "2026-11-05", paymentAccountId: bank, interestCategoryId: await cat("Loan Payments") }));
  await createGoal(userId, goalFormSchema.parse({ name: "Laptop", goalType: "GOAL", targetAmount: "120000", targetDate: "2027-10-31", icon: "laptop", color: "#0d9488", priority: "MEDIUM", linkedAccountId: "" }));
  return { userId };
}

describe("safe-to-spend (D-032)", () => {
  it("spendable balance − what's due before next income − goal savings", async () => {
    const s = await setup();
    const r = await getSafeToSpend(s.userId, "BDT", TODAY);

    expect(r.windowEnd).toBe("2026-11-24"); // the day before salary
    expect(r.untilIncome).toBe(true);
    expect(r.daysLeft).toBe(22);
    // Savings is opted out and the card is a liability; Cash is the default ৳0 account.
    expect(r.accounts.map((a) => a.name).sort()).toEqual(["Bank", "Cash", "Wallet"]);
    expect(r.available).toBe("65000.00");
    expect(r.commitments.map((c) => `${c.date} ${c.kind} ${c.title} ${c.amount}`)).toEqual([
      "2026-11-05 EMI Car Loan EMI 23536.74",
      "2026-11-10 TRANSFER To savings 5000.00",
      "2026-11-15 BILL Internet 1500.00",
      "2026-11-20 RECURRING Rent 20000.00",
    ]);
    expect(r.committed).toBe("50036.74");

    const laptop = (await getGoals(s.userId, TODAY)).find((g) => g.name === "Laptop")!;
    expect(r.goals).toEqual([{ title: "Laptop", amount: laptop.requiredMonthly }]);
    const expected = toMoney("65000").minus("50036.74").minus(laptop.requiredMonthly!);
    expect(r.safe).toBe(expected.toFixed(2));
  });

  it("falls back to month-end without scheduled income and reports a shortfall", async () => {
    const userId = await createTestUser();
    const bank = (await createAccount(userId, accountValues({ name: "Bank", openingBalance: "1000", openingDate: "2026-10-01" }))).id;
    const rent = (await db.category.findFirstOrThrow({ where: { userId, name: "Rent" } })).id;
    await createBill({ userId, baseCurrency: "BDT" }, billFormSchema.parse({ name: "Rent", amount: "15000", categoryId: rent, paymentAccountId: bank, unit: "MONTHLY", interval: 1, firstDueDate: "2026-10-28" }), TODAY);

    const r = await getSafeToSpend(userId, "BDT", TODAY);
    expect(r.windowEnd).toBe("2026-11-30");
    expect(r.untilIncome).toBe(false);
    // The overdue October rent and November's both count.
    expect(r.commitments.map((c) => c.date)).toEqual(["2026-10-28", "2026-11-28"]);
    expect(r.safe).toBe("-29000.00");
    expect(r.perDay).toBeNull();
  });
});
