import "server-only";
import { liabilityOutstanding } from "@/domain/accounts";
import { amortizationSchedule, MAX_MONTHS, payoffPlan, summarize, type PayoffStrategy } from "@/domain/loans";
import { Money, ZERO, percentOf, round2, sum, toMoney, toMoneyString } from "@/domain/money";
import { dbToDay, type Day } from "@/domain/period";
import { nextAfter, occurrenceAt, type Schedule } from "@/domain/recurrence";
import { db } from "../db";
import { getAccountsOverview } from "./accounts.query";

export interface LoanPaymentDTO {
  id: string;
  date: Day;
  principal: string;
  interest: string;
  total: string;
}

export interface LoanDTO {
  /** LoanTerms id; null when the loan account has no details yet. */
  id: string | null;
  accountId: string;
  name: string;
  currency: string;
  color: string;
  icon: string;
  /** Owed now, from the ledger. */
  outstanding: string;
  terms: {
    principal: string;
    annualRate: string;
    termMonths: number;
    firstPaymentDate: Day;
    emiAmount: string;
    paymentAccountId: string;
    paymentAccountName: string;
    interestCategoryId: string;
  } | null;
  /** Share of the original principal repaid, 0–100. */
  repaidPct: string | null;
  nextDue: Day | null;
  overdue: boolean;
  /** At the current EMI; null when the EMI doesn't cover the interest. */
  remainingMonths: number | null;
  payoffDate: Day | null;
  remainingInterest: string | null;
  interestPaid: string;
  /** Pre-fill for the next payment: the EMI, or what clears the loan if that's less. */
  suggestedPayment: string | null;
  payments: LoanPaymentDTO[];
}

export interface CardDTO {
  accountId: string;
  name: string;
  currency: string;
  outstanding: string;
  creditLimit: string | null;
  utilizationPct: string | null;
}

export interface PayoffDTO {
  strategy: PayoffStrategy;
  months: number | null;
  totalInterest: string;
  order: { accountId: string; name: string; month: number }[];
}

export interface DebtsDTO {
  baseCurrency: string;
  totals: {
    /** All active liabilities converted to the base currency (loans + cards). */
    totalOwed: string;
    monthlyEmi: string;
    interestPaid: string;
    unconvertedCount: number;
  };
  loans: LoanDTO[];
  cards: CardDTO[];
  /** Loans in the base currency with details; cards have no rate on record so aren't included. */
  payoff: { extra: string; plans: PayoffDTO[]; excludedCount: number } | null;
}

const monthly = (start: Day): Schedule => ({ start, unit: "MONTHLY", interval: 1 });

export async function getDebts(userId: string, baseCurrency: string, today: Day, extra = "0"): Promise<DebtsDTO> {
  const [overview, terms] = await Promise.all([
    getAccountsOverview(userId, baseCurrency),
    db.loanTerms.findMany({
      where: { userId },
      include: { paymentAccount: { select: { name: true } }, payments: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } },
    }),
  ]);
  const termsByAccount = new Map(terms.map((t) => [t.accountId, t]));
  const active = overview.accounts.filter((a) => !a.isArchived && a.nature === "LIABILITY");

  const loans: LoanDTO[] = active
    .filter((a) => a.type === "LOAN")
    .map((a) => {
      const owed = liabilityOutstanding(a.balance);
      const t = termsByAccount.get(a.id);
      const payments = (t?.payments ?? []).map((p) => ({
        id: p.id,
        date: dbToDay(p.date),
        principal: toMoneyString(p.principal),
        interest: toMoneyString(p.interest),
        total: toMoneyString(toMoney(p.principal).plus(toMoney(p.interest))),
      }));
      const interestPaid = sum(payments.map((p) => p.interest));
      const base = {
        accountId: a.id,
        name: a.name,
        currency: a.currency,
        color: a.color,
        icon: a.icon,
        outstanding: toMoneyString(owed),
        interestPaid: toMoneyString(interestPaid),
        payments,
      };
      if (!t) {
        return { ...base, id: null, terms: null, repaidPct: null, nextDue: null, overdue: false, remainingMonths: null, payoffDate: null, remainingInterest: null, suggestedPayment: null };
      }

      const first = dbToDay(t.firstPaymentDate);
      const nextDue = owed.greaterThan(0) ? (payments[0] ? nextAfter(monthly(first), payments[0].date) : first) : null;
      let remainingMonths: number | null = 0;
      let remainingInterest: string | null = "0.00";
      let payoffDate: Day | null = null;
      if (owed.greaterThan(0)) {
        try {
          const rows = amortizationSchedule(owed, t.annualRate, MAX_MONTHS, t.emiAmount);
          const s = summarize(rows);
          // Reaching the simulation cap means the EMI never clears it (the cap force-settles).
          remainingMonths = rows.length < MAX_MONTHS ? s.months : null;
          remainingInterest = remainingMonths === null ? null : toMoneyString(s.totalInterest);
          if (remainingMonths !== null && nextDue) {
            let k = 0;
            while (occurrenceAt(monthly(first), k) < nextDue) k++;
            payoffDate = occurrenceAt(monthly(first), k + remainingMonths - 1);
          }
        } catch {
          remainingMonths = null;
          remainingInterest = null;
        }
      }
      const principal = toMoney(t.principal);
      const repaid = principal.minus(owed);
      const clearing = owed.plus(round2(owed.times(toMoney(t.annualRate)).div(1200)));
      const suggestedPayment = owed.greaterThan(0) ? toMoneyString(Money.min(toMoney(t.emiAmount), clearing)) : null;
      return {
        ...base,
        id: t.id,
        terms: {
          principal: toMoneyString(principal),
          annualRate: toMoney(t.annualRate).toString(),
          termMonths: t.termMonths,
          firstPaymentDate: first,
          emiAmount: toMoneyString(t.emiAmount),
          paymentAccountId: t.paymentAccountId,
          paymentAccountName: t.paymentAccount.name,
          interestCategoryId: t.interestCategoryId,
        },
        repaidPct: percentOf(repaid.isNegative() ? ZERO : repaid, principal)?.toFixed(1) ?? null,
        nextDue,
        overdue: nextDue !== null && nextDue < today,
        remainingMonths,
        payoffDate,
        remainingInterest,
        suggestedPayment,
      };
    });

  const cards: CardDTO[] = active
    .filter((a) => a.type === "CREDIT_CARD")
    .map((a) => {
      const owed = liabilityOutstanding(a.balance);
      return {
        accountId: a.id,
        name: a.name,
        currency: a.currency,
        outstanding: toMoneyString(owed),
        creditLimit: a.creditLimit,
        utilizationPct: a.creditLimit ? (percentOf(owed, a.creditLimit)?.toFixed(1) ?? null) : null,
      };
    });

  const plannable = loans.filter((l) => l.terms && l.currency === baseCurrency && toMoney(l.outstanding).greaterThan(0));
  const names = new Map(loans.map((l) => [l.accountId, l.name]));
  const debtInputs = plannable.map((l) => ({
    id: l.accountId,
    balance: l.outstanding,
    annualRatePct: l.terms!.annualRate,
    minPayment: l.terms!.emiAmount,
  }));
  const payoff =
    debtInputs.length > 0
      ? {
          extra: toMoneyString(extra),
          excludedCount: loans.length - plannable.length,
          plans: (["AVALANCHE", "SNOWBALL"] as const).map((strategy) => {
            const r = payoffPlan(debtInputs, extra, strategy);
            return {
              strategy,
              months: r.months,
              totalInterest: toMoneyString(r.totalInterest),
              order: r.order.map((id) => ({ accountId: id, name: names.get(id) ?? "Loan", month: r.clearedInMonth[id] })),
            };
          }),
        }
      : null;

  return {
    baseCurrency,
    totals: {
      totalOwed: overview.totals.totalLiabilities,
      monthlyEmi: toMoneyString(sum(loans.filter((l) => l.terms && l.currency === baseCurrency && toMoney(l.outstanding).greaterThan(0)).map((l) => l.terms!.emiAmount))),
      interestPaid: toMoneyString(sum(loans.filter((l) => l.currency === baseCurrency).map((l) => l.interestPaid))),
      unconvertedCount: active.filter((a) => a.baseBalance === null).length,
    },
    loans,
    cards,
    payoff,
  };
}
