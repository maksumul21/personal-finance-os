# Roadmap

Ordered by dependency. Each module ships complete — domain logic with unit tests, services
with integration tests, UI, browser check — before the next starts. Status of what's built is in
`CHECKLIST.md`; the session log is in `PROGRESS.md`.

## Now: Phase 4 — Debt, investments, net worth

1. ~~Debt & loan management~~ — done 2026-11-02 (D-026 – D-028).
2. **Investment tracker** (next) — holdings (asset, units, cost), recorded prices, market value,
   gain/loss; INVESTMENT accounts switch from ledger value to market value (replaces D-022).
3. **Net worth tracker** — page with history; manual assets and liabilities; uses 1 and 2.

## Phase 5 — Planning and insight

4. **Financial calendar** — bills, recurring, goal target dates, loan EMIs in one view.
5. **Safe-to-spend** — balances of `includeInSafeToSpend` accounts − upcoming bills/recurring
   expenses before next income − goal commitments. Formula to confirm against the original PRD.
6. **Cash-flow forecasting** — project balances from recurring rules, bills and EMIs.
7. **Reports & analytics** — period reports, category trends, expense-to-income (§14.2), export.
8. **What-if calculator** — scenarios over the forecast (extra EMI, new expense, raise).
9. **Financial health score** — composite of savings rate, emergency-fund months, debt ratio,
   budget adherence. Weights to confirm against the original PRD.

## Phase 6 — Data and SaaS readiness

10. Data export (CSV/JSON of all user data) and import (CSV transactions with preview).
11. Password reset, account deletion (with export first), session management.
12. Production: Supabase project + `prisma migrate deploy`, email templates, `CRON_SECRET`,
    error monitoring, CSP header, backups.

## Technical debt (prioritised)

| Priority | Item |
|---|---|
| High | `PRD.md` is reconstructed — get the original and re-audit. |
| Medium | `listBudgets` builds full detail for every budget (N+1 queries); rollover walks budgets one query at a time. |
| Medium | Daily cron processes users serially in one request; batch or queue before many users. |
| Medium | Some components compute money for display (budget difference, % change) — move into queries (architecture rule 1). |
| Low | `pg` "client already executing a query" deprecation comes from `@prisma/adapter-pg`; revisit on Prisma upgrade / `pg` 9. |
| Low | Local `prisma dev` DB breaks when integration tests run while `next dev` is up; restart the dev server after tests. |
| Low | No Content-Security-Policy header. |
| Low | Settings selects render empty until hydration. |
