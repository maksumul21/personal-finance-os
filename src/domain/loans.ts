import { Money, ZERO, round2, sum, toMoney, type MoneyInput } from "./money";

/**
 * Loan and debt calculations (ROADMAP Phase 4). Pure, exact decimals, no I/O.
 * Rates are annual percentages (9 = 9% a year), compounded monthly on the outstanding balance.
 * A loan payment splits into principal (a TRANSFER to the loan account) and interest (an
 * EXPENSE), per DECISIONS.md D-002.
 */

/** Hard stop for simulations so a payment that can't cover interest never loops forever. */
export const MAX_MONTHS = 600;

function monthlyRate(annualRatePct: MoneyInput): Money {
  const r = toMoney(annualRatePct);
  if (r.isNegative()) throw new RangeError("Interest rate can't be negative");
  return r.div(1200);
}

function positivePrincipal(principal: MoneyInput): Money {
  const p = toMoney(principal);
  if (!p.greaterThan(0)) throw new RangeError("Principal must be greater than zero");
  return p;
}

/**
 * Equated monthly instalment, rounded to 2 dp:
 * EMI = P·r·(1+r)^n / ((1+r)^n − 1), or P / n when the rate is zero.
 */
export function emi(principal: MoneyInput, annualRatePct: MoneyInput, months: number): Money {
  const p = positivePrincipal(principal);
  if (!Number.isInteger(months) || months < 1) throw new RangeError("Term must be at least one month");
  const r = monthlyRate(annualRatePct);
  if (r.isZero()) return round2(p.div(months));
  const growth = r.plus(1).pow(months);
  return round2(p.times(r).times(growth).div(growth.minus(1)));
}

export interface PaymentSplit {
  interest: Money;
  principal: Money;
  /** Outstanding after the payment. */
  balance: Money;
}

/**
 * Splits one payment against an outstanding balance: interest for the month first (rounded to
 * 2 dp), the rest reduces principal. The principal part never exceeds what's owed.
 * Throws when the payment doesn't cover the month's interest (the debt would grow).
 */
export function splitPayment(outstanding: MoneyInput, annualRatePct: MoneyInput, payment: MoneyInput): PaymentSplit {
  const owed = toMoney(outstanding);
  const pay = toMoney(payment);
  if (!pay.greaterThan(0)) throw new RangeError("Payment must be greater than zero");
  const interest = round2(owed.times(monthlyRate(annualRatePct)));
  if (pay.lessThan(interest)) throw new RangeError("Payment doesn't cover this month's interest");
  const principal = Money.min(pay.minus(interest), owed);
  return { interest, principal, balance: owed.minus(principal) };
}

export interface ScheduleRow extends PaymentSplit {
  /** 1-based instalment number. */
  n: number;
  payment: Money;
}

/**
 * Month-by-month schedule. Every instalment is the EMI except the last, which pays exactly what
 * remains, so principal parts always sum to the original principal.
 */
export function amortizationSchedule(
  principal: MoneyInput,
  annualRatePct: MoneyInput,
  months: number,
  payment: MoneyInput = emi(principal, annualRatePct, months),
): ScheduleRow[] {
  let balance = positivePrincipal(principal);
  const rows: ScheduleRow[] = [];
  for (let n = 1; balance.greaterThan(0) && n <= MAX_MONTHS; n++) {
    const s = splitPayment(balance, annualRatePct, payment);
    // EMI rounding can leave a few paisa after the final scheduled instalment; settle them then.
    const p = n >= months ? balance : s.principal;
    rows.push({ n, payment: p.plus(s.interest), interest: s.interest, principal: p, balance: balance.minus(p) });
    balance = balance.minus(p);
  }
  return rows;
}

export interface ScheduleSummary {
  months: number;
  totalPaid: Money;
  totalInterest: Money;
}

export function summarize(rows: ScheduleRow[]): ScheduleSummary {
  return {
    months: rows.length,
    totalPaid: sum(rows.map((r) => r.payment)),
    totalInterest: sum(rows.map((r) => r.interest)),
  };
}

// ───────────────────────────── Payoff strategies ─────────────────────────────

export type PayoffStrategy = "SNOWBALL" | "AVALANCHE";

export interface DebtInput {
  id: string;
  balance: MoneyInput;
  annualRatePct: MoneyInput;
  /** Minimum monthly payment. */
  minPayment: MoneyInput;
}

export interface PayoffResult {
  strategy: PayoffStrategy;
  /** Months until every debt is paid; null when the budget can't get there within MAX_MONTHS. */
  months: number | null;
  totalInterest: Money;
  /** Debt ids in the order they are paid off. */
  order: string[];
  /** Month (1-based) each debt is cleared. */
  clearedInMonth: Record<string, number>;
}

/**
 * Simulates paying every debt's minimum each month and putting `extraMonthly` (plus minimums
 * freed by cleared debts) on one target: the smallest balance (snowball) or the highest rate
 * (avalanche). Ties keep input order.
 */
export function payoffPlan(debts: DebtInput[], extraMonthly: MoneyInput, strategy: PayoffStrategy): PayoffResult {
  const state = debts.map((d, i) => ({
    i,
    id: d.id,
    balance: toMoney(d.balance),
    rate: monthlyRate(d.annualRatePct),
    min: toMoney(d.minPayment),
  }));
  const budget = sum(state.map((d) => d.min)).plus(toMoney(extraMonthly));
  const order: string[] = [];
  const clearedInMonth: Record<string, number> = {};
  let totalInterest = ZERO;

  for (const d of state) {
    if (!d.balance.greaterThan(0)) {
      order.push(d.id);
      clearedInMonth[d.id] = 0;
    }
  }

  let month = 0;
  while (state.some((d) => d.balance.greaterThan(0))) {
    month++;
    if (month > MAX_MONTHS) return { strategy, months: null, totalInterest, order, clearedInMonth };

    const open = state.filter((d) => d.balance.greaterThan(0));
    for (const d of open) {
      const interest = round2(d.balance.times(d.rate));
      d.balance = d.balance.plus(interest);
      totalInterest = totalInterest.plus(interest);
    }

    // Minimums first, then everything left goes to the target.
    let available = budget;
    for (const d of open) {
      const pay = Money.min(d.min, d.balance, available);
      d.balance = d.balance.minus(pay);
      available = available.minus(pay);
    }
    const ranked = [...open].sort((a, b) =>
      strategy === "SNOWBALL"
        ? a.balance.comparedTo(b.balance) || a.i - b.i
        : b.rate.comparedTo(a.rate) || a.i - b.i,
    );
    for (const d of ranked) {
      if (!available.greaterThan(0)) break;
      const pay = Money.min(d.balance, available);
      d.balance = d.balance.minus(pay);
      available = available.minus(pay);
    }

    for (const d of open) {
      if (!d.balance.greaterThan(0)) {
        order.push(d.id);
        clearedInMonth[d.id] = month;
      }
    }
  }
  return { strategy, months: month, totalInterest, order, clearedInMonth };
}
