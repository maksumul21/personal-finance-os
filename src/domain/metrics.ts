import { percentOf, toMoney, type Money, type MoneyInput } from "./money";

/** PRD §4.1: Monthly Savings = Income − Expenses. */
export function savings(income: MoneyInput, expenses: MoneyInput): Money {
  return toMoney(income).minus(toMoney(expenses));
}

/** PRD §4.1: Savings Rate = Savings / Income × 100. Null (N/A) when income is zero. */
export function savingsRate(income: MoneyInput, expenses: MoneyInput): Money | null {
  return percentOf(savings(income, expenses), income);
}

/** PRD §14.2: Expense-to-Income Ratio = Expenses / Income × 100. */
export function expenseToIncomeRatio(income: MoneyInput, expenses: MoneyInput): Money | null {
  return percentOf(expenses, income);
}
