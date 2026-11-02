import "server-only";
import { accountBalance, accountNature, isMarkedToMarket } from "@/domain/accounts";
import { emi, splitPayment } from "@/domain/loans";
import { round2, toMoney } from "@/domain/money";
import { dayToDb } from "@/domain/period";
import type { LoanPaymentValues, LoanTermsValues } from "@/features/debts/schemas";
import { transactionFormSchema } from "@/features/transactions/schemas";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";
import { postTransactionTx, removeTransactionTx } from "./transactions.service";

interface Ctx {
  userId: string;
  baseCurrency: string;
}

/** Amount still owed on a loan account: −(opening + Σ entries), never below zero. */
async function outstanding(tx: DbTx, userId: string, accountId: string, openingBalance: unknown) {
  const agg = await tx.ledgerEntry.aggregate({ where: { userId, accountId }, _sum: { amount: true } });
  const balance = accountBalance(toMoney(String(openingBalance)), agg._sum.amount ? [agg._sum.amount] : []);
  return balance.isNegative() ? balance.negated() : toMoney(0);
}

/** The account EMIs come from: an active asset account in the loan's currency. */
async function checkPaymentAccount(tx: DbTx, userId: string, id: string, loanCurrency: string, field: string) {
  const account = await tx.account.findFirst({ where: { id, userId } });
  if (!account) throw new UserFacingError("Account not found.", field);
  if (account.isArchived) throw new UserFacingError(`“${account.name}” is archived.`, field);
  if (accountNature(account.type) === "LIABILITY" || isMarkedToMarket(account.type)) {
    throw new UserFacingError("Pay loans from a cash, bank, savings or wallet account.", field);
  }
  if (account.currency !== loanCurrency) {
    throw new UserFacingError(`Pay this loan from a ${loanCurrency} account.`, field);
  }
  return account;
}

/** Creates or replaces the terms of a LOAN account. Past payments keep their recorded split. */
export async function saveLoanTerms(ctx: Ctx, values: LoanTermsValues) {
  return db.$transaction(async (tx) => {
    const account = await tx.account.findFirst({ where: { id: values.accountId, userId: ctx.userId } });
    if (!account) throw new UserFacingError("Loan account not found.", "accountId");
    if (account.type !== "LOAN") throw new UserFacingError("Loan details apply to loan accounts only.", "accountId");
    if (account.isArchived) throw new UserFacingError(`“${account.name}” is archived.`, "accountId");
    if (values.paymentAccountId === account.id) {
      throw new UserFacingError("Choose the account you pay from, not the loan itself.", "paymentAccountId");
    }
    await checkPaymentAccount(tx, ctx.userId, values.paymentAccountId, account.currency, "paymentAccountId");

    const category = await tx.category.findFirst({ where: { id: values.interestCategoryId, userId: ctx.userId } });
    if (!category) throw new UserFacingError("Category not found.", "interestCategoryId");
    if (category.kind !== "EXPENSE") throw new UserFacingError("Interest is an expense; pick an expense category.", "interestCategoryId");
    if (category.isArchived) throw new UserFacingError(`“${category.name}” is archived.`, "interestCategoryId");

    const computed = emi(values.principal, values.annualRate, values.termMonths);
    const data = {
      principal: values.principal,
      annualRate: values.annualRate,
      termMonths: values.termMonths,
      firstPaymentDate: dayToDb(values.firstPaymentDate),
      emiAmount: values.emiAmount ?? computed.toFixed(2),
      paymentAccountId: values.paymentAccountId,
      interestCategoryId: values.interestCategoryId,
    };
    const before = await tx.loanTerms.findUnique({ where: { accountId: account.id } });
    const saved = before
      ? await tx.loanTerms.update({ where: { id: before.id }, data })
      : await tx.loanTerms.create({ data: { userId: ctx.userId, accountId: account.id, ...data } });
    await audit(tx, ctx.userId, before ? "loan.update" : "loan.create", "LoanTerms", saved.id, before ?? undefined, values);
    return { id: saved.id };
  });
}

/** Removes the terms and payment records. The transfers and expenses already posted stay. */
export async function deleteLoanTerms(ctx: Ctx, id: string) {
  return db.$transaction(async (tx) => {
    const loan = await tx.loanTerms.findFirst({ where: { id, userId: ctx.userId } });
    if (!loan) throw new UserFacingError("Loan not found.");
    await tx.loanTerms.delete({ where: { id: loan.id } });
    await audit(tx, ctx.userId, "loan.delete", "LoanTerms", id, loan);
    return { id };
  });
}

/**
 * Records one instalment (DECISIONS.md D-002): the principal part is a TRANSFER from the paying
 * account to the loan account, the interest part an EXPENSE. Both post in one DB transaction.
 * Interest is the lender's figure when given, otherwise one month's interest on what's owed.
 */
export async function recordLoanPayment(ctx: Ctx, v: LoanPaymentValues) {
  return db.$transaction(async (tx) => {
    const loan = await tx.loanTerms.findFirst({ where: { id: v.loanId, userId: ctx.userId }, include: { account: true } });
    if (!loan) throw new UserFacingError("Loan not found.");
    const fromId = v.accountId || loan.paymentAccountId;
    if (fromId !== loan.paymentAccountId) {
      await checkPaymentAccount(tx, ctx.userId, fromId, loan.account.currency, "accountId");
    }

    const owed = await outstanding(tx, ctx.userId, loan.accountId, loan.account.openingBalance);
    if (!owed.greaterThan(0)) throw new UserFacingError("This loan is already paid off.");

    const amount = toMoney(v.amount);
    let interest;
    let principal;
    if (v.interest !== null) {
      interest = toMoney(v.interest);
      principal = amount.minus(interest);
      if (!principal.greaterThan(0)) throw new UserFacingError("The payment must be more than the interest.", "interest");
    } else {
      try {
        ({ interest } = splitPayment(owed, loan.annualRate, amount));
      } catch {
        throw new UserFacingError("This payment doesn't cover the month's interest.", "amount");
      }
      // Not capped: an amount above what's owed must be corrected, never silently trimmed.
      principal = amount.minus(interest);
      if (!principal.greaterThan(0)) throw new UserFacingError("The payment must be more than the interest.", "amount");
    }
    if (principal.greaterThan(owed)) {
      throw new UserFacingError(`Only ${round2(owed).toFixed(2)} of principal is still owed. Lower the amount.`, "amount");
    }

    const base = { date: v.date, notes: "" };
    const principalTx = await postTransactionTx(
      tx,
      ctx,
      transactionFormSchema.parse({
        ...base,
        type: "TRANSFER",
        fromAccountId: fromId,
        toAccountId: loan.accountId,
        amount: principal.toFixed(2),
        description: `Loan principal: ${loan.account.name}`,
      }),
      { source: "DEBT" },
    );
    const interestTx = interest.greaterThan(0)
      ? await postTransactionTx(
          tx,
          ctx,
          transactionFormSchema.parse({
            ...base,
            type: "EXPENSE",
            accountId: fromId,
            categoryId: loan.interestCategoryId,
            amount: interest.toFixed(2),
            description: `Loan interest: ${loan.account.name}`,
          }),
          { source: "DEBT" },
        )
      : null;

    const payment = await tx.loanPayment.create({
      data: {
        loanId: loan.id,
        userId: ctx.userId,
        date: dayToDb(v.date),
        principal: principal.toFixed(2),
        interest: interest.toFixed(2),
        principalTransactionId: principalTx.id,
        interestTransactionId: interestTx?.id ?? null,
      },
    });
    await audit(tx, ctx.userId, "loan.payment.create", "LoanPayment", payment.id, undefined, v);
    return { id: payment.id, principal: principal.toFixed(2), interest: interest.toFixed(2) };
  });
}

/** Undoes an instalment: both of its transactions are removed, restoring the balances. */
export async function deleteLoanPayment(ctx: Ctx, id: string) {
  return db.$transaction(async (tx) => {
    const p = await tx.loanPayment.findFirst({ where: { id, userId: ctx.userId } });
    if (!p) throw new UserFacingError("Payment not found.");
    await tx.loanPayment.delete({ where: { id: p.id } });
    if (p.principalTransactionId) await removeTransactionTx(tx, ctx, p.principalTransactionId);
    if (p.interestTransactionId) await removeTransactionTx(tx, ctx, p.interestTransactionId);
    await audit(tx, ctx.userId, "loan.payment.delete", "LoanPayment", id, p);
    return { id };
  });
}
