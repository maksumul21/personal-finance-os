# Personal Finance OS — Product Requirements (reconstructed)

> **Status: RECONSTRUCTED, NOT THE APPROVED ORIGINAL.**
> The approved PRD was supplied in an earlier working session but was never saved to this
> repository. This file is rebuilt from (a) the module list the product owner gave on
> 2026-11-02, (b) the PRD section numbers cited in code, tests and docs, and (c) the approved
> architecture and decisions. Where the original wording or a requirement is unknown, it says
> so. **Replace this file with the original PRD text as soon as it is available**, then re-run
> the feature audit against it.

## 1. Product

A personal finance operating system for individuals (Bangladesh-first: BDT base currency,
lakh number format, bKash / Nagad / Rocket wallets, `Asia/Dhaka` timezone), built as a
multi-tenant SaaS web app (D-004). Accuracy, security and data integrity come before speed.

## 2. Users and access

- Email + password sign-up with email confirmation; magic-link sign-in (D-005). Google OAuth later.
- Every user sees only their own data (multi-tenant isolation).
- *Unknown from the original:* password reset flow, account deletion, plan / billing tiers.

## 3. Navigation (PRD §3)

Dashboard · Transactions · Budgets · Accounts · Savings Goals · Bills & Subscriptions ·
Debt Management · Investments · Net Worth · Financial Calendar · Reports & Analytics · Settings.

## 4. Dashboard (PRD §4)

- §4.1 KPIs: Total Balance (active asset accounts, excl. investment), Income, Expenses,
  Savings = Income − Expenses, Savings Rate = Savings / Income × 100 (N/A when income is 0),
  Net Worth, Remaining Budget = allocated − actual budgeted expenses.
- §4.2 Charts: income vs expenses, cash flow, savings, net worth trend; expense breakdown.
- §4.4 Upcoming and overdue bills.
- §4.5 Rule-based financial insights.
- §15.4 Period comparisons use the same elapsed days of the previous period.

## 5. Transactions (PRD §5)

- Income, expense, transfer; edit, duplicate, delete; tags; notes; refunds (D-007).
- §5.1 Transfers never count as income or expense.
- §5.3 Categories in two levels (D-014). New users start with none and create their own (D-036, replaces the default tree).
- §5.7 Recurring transactions, posted idempotently.
- History with filters, search, sort, pagination.

## 6. Budgets (PRD §6)

- §6.1 Weekly / monthly / annual / custom periods; category limits (group includes subcategories).
- §6.2 Budget vs actual, Remaining = Budget − Actual, utilisation states with thresholds.
- §6.4 Zero-based budgeting: Available income − planned allocations = 0.
- §6.5 Templates: 50/30/20 and 70/20/10.
- §6.6 Rollover of unused budget (D-019).

## 7. Accounts (PRD §7)

- §7.1 Types: cash, bank, savings, MFS (bKash/Nagad/Rocket), credit card, loan, investment, other asset (D-013).
- §7.3 Current balance = opening balance + Σ ledger entries; opening balance is not income (D-011).
- Archive instead of delete once used (§25).

## 8. Savings goals (PRD §8)

- §8.1 Goals with target, date, priority, linked account.
- §8.2 Progress and required monthly saving.
- §8.4 Emergency fund: target = essential monthly expenses × months.
- Sinking funds.

## 9. Bills & subscriptions (PRD §9)

- §9.1–9.3 Schedules, occurrences, calendar, subscription monthly/annual cost.
- §9.4 Paying a bill creates one expense, once.

## 10–13. Later modules (sections not cited in code; content inferred from the module list)

- **Debt & loan management:** loans and credit cards as liability accounts (D-003);
  EMI = principal transfer + interest expense (D-002); payoff tracking and strategies.
- **Investment tracker:** holdings valued at market; returns.
- **Net worth tracker:** accounts + investments + manual assets − manual liabilities, over time.
- **Financial calendar:** bills, recurring items, goal dates in one view.

## 14. Reports & analytics (PRD §14)

- §14.2 Expense-to-income ratio = Expenses / Income × 100. Other reports: *unknown from the original.*

## 15–17. Planning tools (inferred from the module list)

Safe-to-spend, what-if calculator, cash-flow forecasting, financial health score.
*Formulas unknown from the original.* Accounts already carry an `includeInSafeToSpend` flag.

## 18. Multi-currency (PRD §18)

- Each account has a currency; transactions store the amount, rate and base amount.
- §18.4 Rates come only from what the user records (latest on or before the date); never guessed.

## 19. Design (PRD §19)

Light/dark design tokens, accessible colour use (never colour-only meaning, D-020), responsive
at phone / tablet / desktop.

## 20–24. Settings, import/export, security, SaaS

- Settings: profile, base currency, timezone, date/number formats, week start, dashboard period,
  budget thresholds, theme.
- Data import and export: *details unknown from the original.*
- §21 Transfers never count as income/expense. §25 Archived records drop out of active summaries.
- §26 Acceptance scenarios for the ledger (transfers, credit cards) — encoded in tests.
