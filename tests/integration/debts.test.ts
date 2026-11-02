import { afterAll, afterEach, describe, expect, it } from "vitest";
import { loanPaymentSchema, loanTermsSchema, type LoanPaymentInput, type LoanTermsInput } from "@/features/debts/schemas";
import { transactionFormSchema } from "@/features/transactions/schemas";
import { db } from "@/server/db";
import { getAccountsOverview } from "@/server/queries/accounts.query";
import { getDebts } from "@/server/queries/debts.query";
import { getTransactionPage } from "@/server/queries/transactions.query";
import { deleteAccount, updateAccount } from "@/server/services/accounts.service";
import { createAccount } from "@/server/services/accounts.service";
import { deleteCategory } from "@/server/services/categories.service";
import { deleteLoanPayment, deleteLoanTerms, recordLoanPayment, saveLoanTerms } from "@/server/services/loans.service";
import { deleteTransaction, updateTransaction } from "@/server/services/transactions.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

const terms = (v: LoanTermsInput) => loanTermsSchema.parse(v);
const pay = (v: LoanPaymentInput) => loanPaymentSchema.parse(v);

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const bank = (await createAccount(userId, accountValues({ name: "Bank", openingBalance: "100000" }))).id;
  // Amount owed is entered positive and stored negative (liability).
  const loan = (await createAccount(userId, accountValues({ name: "Car Loan", type: "LOAN", openingBalance: "500000" }))).id;
  const interestCat = (await db.category.findFirstOrThrow({ where: { userId, name: "Loan Payments" } })).id;
  const balances = async () =>
    Object.fromEntries((await getAccountsOverview(userId, "BDT")).accounts.map((a) => [a.name, a.balance])) as Record<string, string>;
  const totals = async () => (await getTransactionPage(userId, { sort: "date_desc", page: 1, from: "2026-11-01", to: "2026-11-30" })).summary;
  const { id: loanId } = await saveLoanTerms(
    ctx,
    terms({ accountId: loan, principal: "500000", annualRate: "12", termMonths: 24, firstPaymentDate: "2026-11-05", paymentAccountId: bank, interestCategoryId: interestCat }),
  );
  return { userId, ctx, bank, loan, loanId, interestCat, balances, totals };
}

describe("loans (D-002: principal is a transfer, interest an expense)", () => {
  it("an EMI reduces the debt by the principal and counts only the interest as an expense", async () => {
    const s = await setup();
    const saved = await db.loanTerms.findUniqueOrThrow({ where: { id: s.loanId } });
    expect(saved.emiAmount.toFixed(2)).toBe("23536.74"); // ৳5,00,000 at 12% for 24 months

    const r = await recordLoanPayment(s.ctx, pay({ loanId: s.loanId, date: "2026-11-05", amount: "23536.74" }));
    expect(r).toMatchObject({ interest: "5000.00", principal: "18536.74" });

    const b = await s.balances();
    expect(b.Bank).toBe("76463.26");
    expect(b["Car Loan"]).toBe("-481463.26");
    const t = await s.totals();
    expect(t.expenses).toBe("5000.00"); // the transfer part is not spending
    expect(t.income).toBe("0.00");

    const debts = await getDebts(s.userId, "BDT", "2026-11-06");
    const loan = debts.loans[0];
    expect(loan.outstanding).toBe("481463.26");
    expect(loan.interestPaid).toBe("5000.00");
    expect(loan.nextDue).toBe("2026-12-05");
    expect(loan.remainingMonths).toBe(23);
    expect(loan.payoffDate).toBe("2028-10-05");
    expect(debts.totals.totalOwed).toBe("481463.26");
    expect(debts.totals.monthlyEmi).toBe("23536.74");
    expect(debts.payoff?.plans.map((p) => p.months)).toEqual([23, 23]);
  });

  it("uses the lender's interest figure when given; deleting the payment restores both balances", async () => {
    const s = await setup();
    const { id } = await recordLoanPayment(s.ctx, pay({ loanId: s.loanId, date: "2026-11-05", amount: "23536.74", interest: "4900" }));
    expect((await s.balances())["Car Loan"]).toBe("-481363.26");
    expect((await s.totals()).expenses).toBe("4900.00");

    // Its transactions can't be changed one at a time.
    const p = await db.loanPayment.findUniqueOrThrow({ where: { id } });
    await expect(deleteTransaction(s.ctx, p.principalTransactionId!)).rejects.toThrow(/loan payment/);
    await expect(
      updateTransaction(s.ctx, p.interestTransactionId!, transactionFormSchema.parse({ type: "EXPENSE", accountId: s.bank, categoryId: s.interestCat, amount: "1", date: "2026-11-05" })),
    ).rejects.toThrow(/loan payment/);

    await deleteLoanPayment(s.ctx, id);
    const b = await s.balances();
    expect(b.Bank).toBe("100000.00");
    expect(b["Car Loan"]).toBe("-500000.00");
    expect(await db.transaction.count({ where: { userId: s.userId } })).toBe(0);
  });

  it("refuses bad payments: below interest, more than owed, wrong currency, interest ≥ amount", async () => {
    const s = await setup();
    await expect(recordLoanPayment(s.ctx, pay({ loanId: s.loanId, date: "2026-11-05", amount: "4000" }))).rejects.toThrow(/interest/);
    await expect(recordLoanPayment(s.ctx, pay({ loanId: s.loanId, date: "2026-11-05", amount: "600000" }))).rejects.toThrow(/still owed/);
    await expect(recordLoanPayment(s.ctx, pay({ loanId: s.loanId, date: "2026-11-05", amount: "1000", interest: "1000" }))).rejects.toThrow(/more than the interest/);
    const usd = (await createAccount(s.userId, accountValues({ name: "USD", currency: "USD", openingBalance: "100000" }))).id;
    await expect(recordLoanPayment(s.ctx, pay({ loanId: s.loanId, date: "2026-11-05", amount: "23536.74", accountId: usd }))).rejects.toThrow(/BDT account/);
    expect(await db.transaction.count({ where: { userId: s.userId } })).toBe(0);
  });

  it("guards the loan's account, payment account and interest category", async () => {
    const s = await setup();
    const cardId = (await createAccount(s.userId, accountValues({ name: "Card", type: "CREDIT_CARD" }))).id;
    await expect(
      saveLoanTerms(s.ctx, terms({ accountId: cardId, principal: "1000", annualRate: "10", termMonths: 12, firstPaymentDate: "2026-11-05", paymentAccountId: s.bank, interestCategoryId: s.interestCat })),
    ).rejects.toThrow(/loan accounts only/);
    await expect(deleteAccount(s.userId, s.bank)).rejects.toThrow(/loan/);
    await expect(deleteCategory(s.userId, s.interestCat)).rejects.toThrow(/loan/);
    await expect(updateAccount(s.userId, s.loan, accountValues({ name: "Car Loan", type: "CREDIT_CARD", openingBalance: "500000" }))).rejects.toThrow(/loan details/);

    // Removing the terms keeps posted transactions as ordinary ones.
    await recordLoanPayment(s.ctx, pay({ loanId: s.loanId, date: "2026-11-05", amount: "23536.74" }));
    await deleteLoanTerms(s.ctx, s.loanId);
    expect(await db.transaction.count({ where: { userId: s.userId } })).toBe(2);
    expect((await s.balances())["Car Loan"]).toBe("-481463.26");
  });

  it("isolates loans between users", async () => {
    const a = await setup();
    const b = await setup();
    await expect(recordLoanPayment(b.ctx, pay({ loanId: a.loanId, date: "2026-11-05", amount: "23536.74" }))).rejects.toThrow(/not found/);
    await expect(deleteLoanTerms(b.ctx, a.loanId)).rejects.toThrow(/not found/);
    await expect(
      saveLoanTerms(b.ctx, terms({ accountId: a.loan, principal: "1", annualRate: "1", termMonths: 1, firstPaymentDate: "2026-11-05", paymentAccountId: b.bank, interestCategoryId: b.interestCat })),
    ).rejects.toThrow(/not found/);
    expect((await getDebts(b.userId, "BDT", "2026-11-06")).loans.map((l) => l.accountId)).toEqual([b.loan]);
  });
});
