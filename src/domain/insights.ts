import { percentOf, toMoney, toMoneyString, type Money, type MoneyInput } from "./money";

/**
 * Rule-based insights (PRD §4.5, §15). Deterministic: every insight is computed from the numbers
 * passed in, names its comparison period, and is skipped when there isn't enough data.
 */

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

export interface Insight {
  /** Stable id so a dismissal can be remembered per period. */
  key: string;
  severity: InsightSeverity;
  message: string;
  /** The basis of the comparison, shown under the message. */
  basis: string;
}

export interface InsightInput {
  /** e.g. "1–2 Nov" for month-to-date. */
  periodLabel: string;
  /** e.g. "1–2 Oct" — the same span of the previous period. */
  previousLabel: string;
  income: MoneyInput;
  expenses: MoneyInput;
  previousIncome: MoneyInput;
  previousExpenses: MoneyInput;
  /** Spending per top-level expense category this period, base currency. */
  categorySpending: { name: string; amount: MoneyInput }[];
  /** Budget lines for the active budget. */
  budgetLines: { name: string; usagePct: Money | null; state: "normal" | "warning" | "critical" | "overspent" }[];
  formatMoney: (value: string) => string;
}

/** Minimum previous-period spending before a % change is meaningful (avoids "+900%" on ৳100). */
const MIN_COMPARABLE = 1000;
/** Ignore changes smaller than this; they're noise. */
const MIN_CHANGE_PCT = 10;

const pct = (m: Money) => m.toDecimalPlaces(0).toString();

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const income = toMoney(i.income);
  const expenses = toMoney(i.expenses);
  const prevExpenses = toMoney(i.previousExpenses);
  const prevIncome = toMoney(i.previousIncome);

  if (income.greaterThan(0) && expenses.greaterThan(income)) {
    out.push({
      key: "spending-exceeds-income",
      severity: "critical",
      message: `You've spent ${i.formatMoney(toMoneyString(expenses.minus(income)))} more than you earned.`,
      basis: i.periodLabel,
    });
  }

  if (prevExpenses.greaterThanOrEqualTo(MIN_COMPARABLE)) {
    const change = percentOf(expenses.minus(prevExpenses), prevExpenses)!;
    if (change.abs().greaterThanOrEqualTo(MIN_CHANGE_PCT)) {
      const up = change.greaterThan(0);
      out.push({
        key: "expense-change",
        severity: up ? "warning" : "positive",
        message: `Your expenses ${up ? "increased" : "decreased"} by ${pct(change.abs())}% compared with the same days last period.`,
        basis: `${i.periodLabel} vs ${i.previousLabel}`,
      });
    }
  }

  const top = [...i.categorySpending].sort((a, b) => toMoney(b.amount).comparedTo(toMoney(a.amount)))[0];
  if (top && toMoney(top.amount).greaterThan(0)) {
    const ofIncome = percentOf(top.amount, income);
    const ofSpending = percentOf(top.amount, expenses);
    if (ofIncome && ofIncome.greaterThanOrEqualTo(1)) {
      out.push({
        key: `top-category:${top.name}`,
        severity: "info",
        message: `${top.name} is your largest expense: ${pct(ofIncome)}% of your income.`,
        basis: i.periodLabel,
      });
    } else if (ofSpending && i.categorySpending.length > 1) {
      out.push({
        key: `top-category:${top.name}`,
        severity: "info",
        message: `${top.name} is your largest expense: ${pct(ofSpending)}% of spending.`,
        basis: i.periodLabel,
      });
    }
  }

  for (const line of i.budgetLines) {
    if (line.state === "normal" || line.usagePct === null) continue;
    out.push({
      key: `budget:${line.name}`,
      severity: line.state === "overspent" ? "critical" : "warning",
      message:
        line.state === "overspent"
          ? `You've exceeded your ${line.name} budget (${pct(line.usagePct)}% used).`
          : `You've used ${pct(line.usagePct)}% of your ${line.name} budget.`,
      basis: "Active budget",
    });
  }

  if (income.greaterThan(0) && prevIncome.greaterThan(0)) {
    const rate = percentOf(income.minus(expenses), income)!;
    const prevRate = percentOf(prevIncome.minus(prevExpenses), prevIncome)!;
    const diff = rate.minus(prevRate);
    if (diff.abs().greaterThanOrEqualTo(5)) {
      out.push({
        key: "savings-rate-change",
        severity: diff.greaterThan(0) ? "positive" : "warning",
        message: `Your savings rate ${diff.greaterThan(0) ? "improved" : "dropped"} by ${pct(diff.abs())} percentage points, to ${pct(rate)}%.`,
        basis: `${i.periodLabel} vs ${i.previousLabel}`,
      });
    }
  }

  const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, positive: 2, info: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
