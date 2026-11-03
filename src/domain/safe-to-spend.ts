import { addDaysTo, type Day } from "./period";
import { Money, ZERO, sum, toMoney, type MoneyInput } from "./money";

/**
 * Safe-to-spend (ROADMAP Phase 5, DECISIONS.md D-032), agreed formula:
 *
 *   balances of accounts marked "include in safe-to-spend"
 *   − bills, scheduled expenses and EMIs due before the next scheduled income
 *   − what goals still need saved this month
 *
 * The window runs from today to the day before the next scheduled income, or to month-end when
 * no income is scheduled. Pure, exact decimals, no I/O.
 */

export type CommitmentKind = "BILL" | "RECURRING" | "TRANSFER" | "EMI";

export interface Commitment {
  kind: CommitmentKind;
  title: string;
  date: Day;
  /** Base currency, positive. */
  amount: MoneyInput;
}

export interface GoalNeed {
  title: string;
  /** Monthly amount the goal needs to stay on pace. */
  requiredMonthly: MoneyInput;
  /** Deposits already made this month. */
  savedThisMonth: MoneyInput;
}

export interface SafeToSpendInput {
  today: Day;
  monthEnd: Day;
  /** Date of the next scheduled income, if any. */
  nextIncome: Day | null;
  /** Base-currency balances of the included accounts. */
  balances: MoneyInput[];
  commitments: Commitment[];
  goals: GoalNeed[];
}

export interface SafeToSpend {
  windowEnd: Day;
  daysLeft: number;
  available: Money;
  committed: Money;
  goalSetAside: Money;
  /** available − committed − goalSetAside; negative = shortfall. */
  safe: Money;
  /** safe ÷ days left (2 dp, rounded down so it never overstates); null when safe ≤ 0. */
  perDay: Money | null;
  commitments: (Omit<Commitment, "amount"> & { amount: Money })[];
  goals: { title: string; amount: Money }[];
}

const dayCount = (from: Day, to: Day) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** The last day the money has to last: the day before next income, else month-end. */
export function windowEnd(today: Day, monthEnd: Day, nextIncome: Day | null): Day {
  if (nextIncome && nextIncome > today) return addDaysTo(nextIncome, -1);
  return monthEnd;
}

export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const end = windowEnd(input.today, input.monthEnd, input.nextIncome);
  // Anything due by the end of the window counts, including overdue items still unpaid.
  const commitments = input.commitments
    .filter((c) => c.date <= end)
    .map((c) => ({ ...c, amount: toMoney(c.amount) }))
    .filter((c) => c.amount.greaterThan(0))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const goals = input.goals
    .map((g) => {
      const left = toMoney(g.requiredMonthly).minus(toMoney(g.savedThisMonth));
      return { title: g.title, amount: left.isPositive() ? left : ZERO };
    })
    .filter((g) => g.amount.greaterThan(0));

  const available = sum(input.balances);
  const committed = sum(commitments.map((c) => c.amount));
  const goalSetAside = sum(goals.map((g) => g.amount));
  const safe = available.minus(committed).minus(goalSetAside);
  const daysLeft = Math.max(1, dayCount(input.today, end));
  return {
    windowEnd: end,
    daysLeft,
    available,
    committed,
    goalSetAside,
    safe,
    perDay: safe.greaterThan(0) ? safe.div(daysLeft).toDecimalPlaces(2, Money.ROUND_DOWN) : null,
    commitments,
    goals,
  };
}
