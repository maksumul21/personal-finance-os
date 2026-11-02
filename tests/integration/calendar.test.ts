import { afterAll, afterEach, describe, expect, it } from "vitest";
import { billFormSchema } from "@/features/bills/schemas";
import { loanPaymentSchema, loanTermsSchema } from "@/features/debts/schemas";
import { goalFormSchema } from "@/features/goals/schemas";
import { recurringFormSchema } from "@/features/recurring/schemas";
import { transactionFormSchema } from "@/features/transactions/schemas";
import { db } from "@/server/db";
import { getCalendar } from "@/server/queries/calendar.query";
import { createAccount } from "@/server/services/accounts.service";
import { createBill } from "@/server/services/bills.service";
import { createGoal } from "@/server/services/goals.service";
import { recordLoanPayment, saveLoanTerms } from "@/server/services/loans.service";
import { createRecurring } from "@/server/services/recurring.service";
import { createTransaction } from "@/server/services/transactions.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

const TODAY = "2026-11-02";

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const bank = (await createAccount(userId, accountValues({ name: "Bank", openingBalance: "200000" }))).id;
  const cat = async (name: string) => (await db.category.findFirstOrThrow({ where: { userId, name } })).id;

  await createBill(
    ctx,
    billFormSchema.parse({ name: "Internet", amount: "1500", categoryId: await cat("Internet"), paymentAccountId: bank, unit: "MONTHLY", interval: 1, firstDueDate: "2026-10-28" }),
    TODAY,
  );
  await createRecurring(
    ctx,
    recurringFormSchema.parse({ type: "INCOME", amount: "80000", accountId: bank, categoryId: await cat("Salary"), unit: "MONTHLY", interval: 1, startDate: "2026-11-25", description: "Salary" }),
    TODAY,
  );
  const loanAcct = (await createAccount(userId, accountValues({ name: "Car Loan", type: "LOAN", openingBalance: "500000" }))).id;
  const { id: loanId } = await saveLoanTerms(
    ctx,
    loanTermsSchema.parse({ accountId: loanAcct, principal: "500000", annualRate: "12", termMonths: 24, firstPaymentDate: "2026-11-05", paymentAccountId: bank, interestCategoryId: await cat("Loan Payments") }),
  );
  await recordLoanPayment(ctx, loanPaymentSchema.parse({ loanId, date: "2026-11-05", amount: "23536.74" }));
  await createGoal(
    userId,
    goalFormSchema.parse({ name: "Laptop", goalType: "GOAL", targetAmount: "120000", targetDate: "2026-11-30", icon: "laptop", color: "#0d9488", priority: "MEDIUM", linkedAccountId: "" }),
  );
  await createTransaction(ctx, transactionFormSchema.parse({ type: "EXPENSE", accountId: bank, categoryId: await cat("Groceries"), amount: "2300", date: "2026-11-01" }));
  return { userId };
}

describe("financial calendar", () => {
  it("brings bills, recurring, EMIs, goals and daily spending into one month", async () => {
    const s = await setup();
    const nov = await getCalendar(s.userId, "BDT", "2026-11", TODAY, 6);
    const summary = nov.events.map((e) => `${e.date} ${e.kind} ${e.status} ${e.amount ?? ""}`);
    expect(summary).toEqual([
      "2026-11-05 EMI DONE 23536.74",
      "2026-11-25 RECURRING PROJECTED 80000.00",
      "2026-11-28 BILL DUE 1500.00",
      "2026-11-30 GOAL TARGET 120000.00",
    ]);
    expect(nov.actuals["2026-11-01"]).toEqual({ income: "0.00", expenses: "2300.00" });
    // Recorded spending = groceries + EMI interest (the principal is a transfer).
    expect(nov.totals).toMatchObject({ actualIn: "0.00", actualOut: "7300.00", expectedIn: "80000.00", expectedOut: "1500.00", overdueCount: 0 });
    expect(nov.weeks.every((w) => w.length === 7)).toBe(true);

    // October: the unpaid bill from 28 Oct is overdue.
    const oct = await getCalendar(s.userId, "BDT", "2026-10", TODAY, 6);
    expect(oct.events.map((e) => `${e.kind} ${e.status}`)).toEqual(["BILL OVERDUE"]);
    expect(oct.totals.overdueCount).toBe(1);

    // December: next EMI is due on the anchor day; salary and bill continue.
    const dec = await getCalendar(s.userId, "BDT", "2026-12", TODAY, 6);
    expect(dec.events.map((e) => `${e.date} ${e.kind} ${e.status}`)).toEqual(["2026-12-05 EMI DUE", "2026-12-25 RECURRING PROJECTED", "2026-12-28 BILL DUE"]);
  });

  it("projects past the stored bill horizon and stops EMIs at payoff", async () => {
    const s = await setup();
    // Bill occurrences are stored 90 days ahead; June 2027 comes from the schedule.
    const jun = await getCalendar(s.userId, "BDT", "2027-06", TODAY, 6);
    expect(jun.events.filter((e) => e.kind === "BILL").map((e) => `${e.date} ${e.status}`)).toEqual(["2027-06-28 PROJECTED"]);
    expect(jun.events.some((e) => e.kind === "EMI")).toBe(true);
    // 23 instalments remain after the November payment: the last is Oct 2028.
    expect((await getCalendar(s.userId, "BDT", "2028-10", TODAY, 6)).events.some((e) => e.kind === "EMI")).toBe(true);
    expect((await getCalendar(s.userId, "BDT", "2028-11", TODAY, 6)).events.some((e) => e.kind === "EMI")).toBe(false);
  });

  it("shows only the user's own items", async () => {
    await setup();
    const other = await createTestUser();
    expect((await getCalendar(other, "BDT", "2026-11", TODAY, 6)).events).toEqual([]);
  });
});
