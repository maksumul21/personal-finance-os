import { afterAll, afterEach, describe, expect, it } from "vitest";
import { billFormSchema } from "@/features/bills/schemas";
import { loanTermsSchema } from "@/features/debts/schemas";
import { recurringFormSchema, type RecurringFormInput } from "@/features/recurring/schemas";
import { transactionFormSchema } from "@/features/transactions/schemas";
import { db } from "@/server/db";
import { getForecast } from "@/server/queries/forecast.query";
import { createAccount } from "@/server/services/accounts.service";
import { createBill } from "@/server/services/bills.service";
import { saveLoanTerms } from "@/server/services/loans.service";
import { createRecurring } from "@/server/services/recurring.service";
import { createTransaction } from "@/server/services/transactions.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

const TODAY = "2026-11-03";

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const acct = async (name: string, over: Parameters<typeof accountValues>[0]) => (await createAccount(userId, accountValues({ name, openingDate: "2026-10-01", ...over }))).id;
  const bank = await acct("Bank", { openingBalance: "60000" });
  const savings = await acct("Savings", { type: "SAVINGS", openingBalance: "100000", includeInSafeToSpend: false });
  const card = await acct("Card", { type: "CREDIT_CARD", openingBalance: "0" });
  const broker = await acct("Broker", { type: "INVESTMENT", openingBalance: "0" });
  const cat = async (name: string) => (await db.category.findFirstOrThrow({ where: { userId, name } })).id;
  const rule = (v: Omit<RecurringFormInput, "unit" | "interval">) => createRecurring(ctx, recurringFormSchema.parse({ unit: "MONTHLY", interval: 1, ...v }), TODAY);

  await rule({ type: "INCOME", amount: "80000", accountId: bank, categoryId: await cat("Salary"), startDate: "2026-11-25", description: "Salary" });
  await rule({ type: "EXPENSE", amount: "20000", accountId: bank, categoryId: await cat("Rent"), startDate: "2026-11-20", description: "Rent" });
  await rule({ type: "TRANSFER", amount: "3000", accountId: bank, toAccountId: savings, startDate: "2026-11-08", description: "To savings" }); // stays in cash
  await rule({ type: "TRANSFER", amount: "5000", accountId: bank, toAccountId: broker, startDate: "2026-11-10", description: "SIP" }); // leaves cash
  await createBill(ctx, billFormSchema.parse({ name: "Internet", amount: "1500", categoryId: await cat("Internet"), paymentAccountId: bank, unit: "MONTHLY", interval: 1, firstDueDate: "2026-11-15" }), TODAY);
  await createBill(ctx, billFormSchema.parse({ name: "Netflix", amount: "1100", categoryId: await cat("Internet"), paymentAccountId: card, unit: "MONTHLY", interval: 1, firstDueDate: "2026-11-16" }), TODAY);
  const loan = await acct("Car Loan", { type: "LOAN", openingBalance: "500000" });
  await saveLoanTerms(ctx, loanTermsSchema.parse({ accountId: loan, principal: "500000", annualRate: "12", termMonths: 24, firstPaymentDate: "2026-11-05", paymentAccountId: bank, interestCategoryId: await cat("Loan Payments") }));
  // Today's unscheduled spending: the basis for day-to-day spend.
  await createTransaction(ctx, transactionFormSchema.parse({ type: "EXPENSE", accountId: bank, categoryId: await cat("Groceries"), amount: "900", date: TODAY }));
  return { userId };
}

describe("cash-flow forecast (D-033)", () => {
  it("projects the cash pool from scheduled flows", async () => {
    const s = await setup();
    const f = await getForecast(s.userId, "BDT", TODAY, 30, false);

    expect(f.end).toBe("2026-12-02");
    expect(f.accounts.map((a) => a.name).sort()).toEqual(["Bank", "Cash", "Savings"]); // no card, loan or investment
    expect(f.start).toBe("159100.00"); // 59,100 + 0 + 1,00,000
    expect(f.flows.map((x) => `${x.date} ${x.kind} ${x.title} ${x.amount}`)).toEqual([
      "2026-11-05 EMI Car Loan EMI -23536.74",
      "2026-11-10 TRANSFER SIP -5000.00",
      "2026-11-15 BILL Internet -1500.00",
      "2026-11-20 RECURRING Rent -20000.00",
      "2026-11-25 INCOME Salary 80000.00",
    ]);
    expect(f.scheduledOut).toBe("50036.74");
    expect(f.scheduledIn).toBe("80000.00");
    expect(f.lowest).toEqual({ date: "2026-11-20", balance: "109063.26" });
    expect(f.endBalance).toBe("189063.26");
    expect(f.firstNegative).toBeNull();
    expect(f.points).toHaveLength(30);
    expect(f.flows.at(-1)!.balanceAfter).toBe("189063.26");
  });

  it("adds typical day-to-day spending from tomorrow, from unscheduled expenses only", async () => {
    const s = await setup();
    const f = await getForecast(s.userId, "BDT", TODAY, 30, true);
    expect(f.spendBasisDays).toBe(1); // history starts today
    expect(f.dailySpend).toBe("900.00");
    expect(f.dayToDay).toBe("26100.00"); // 29 days after today
    expect(f.endBalance).toBe("162963.26");
  });

  it("flags the first day the balance goes below zero", async () => {
    const userId = await createTestUser();
    const bank = (await createAccount(userId, accountValues({ name: "Bank", openingBalance: "10000", openingDate: "2026-10-01" }))).id;
    const rent = (await db.category.findFirstOrThrow({ where: { userId, name: "Rent" } })).id;
    await createBill({ userId, baseCurrency: "BDT" }, billFormSchema.parse({ name: "Rent", amount: "15000", categoryId: rent, paymentAccountId: bank, unit: "MONTHLY", interval: 1, firstDueDate: "2026-11-10" }), TODAY);
    const f = await getForecast(userId, "BDT", TODAY, 90, false);
    expect(f.firstNegative).toBe("2026-11-10");
    // Three rents fall within 90 days: 10 Nov, 10 Dec and 10 Jan.
    expect(f.flows.map((x) => x.date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(f.endBalance).toBe("-35000.00");
  });
});
