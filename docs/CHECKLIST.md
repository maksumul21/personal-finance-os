# Development Checklist

## Feature status (full audit, 2026-11-02)

Statuses: **Tested** = automated tests plus a browser check · **Logic-tested** = service and
integration tests pass, but the UI flow wasn't clicked through in the audit · **Partial** ·
**Not started** · **Blocked (external)**. Measured against the reconstructed `PRD.md`.

| # | Module | Status | Evidence / gaps |
|---|---|---|---|
| 1 | Authentication & user management | Partial | Sign-up, confirm, password and magic-link sign-in, logout, first-login provisioning verified live (earlier session). Safe redirects tested. **Missing:** password reset, account deletion, Google OAuth (deferred, D-005). |
| 2 | Dashboard | Tested | KPIs, comparisons, trends, donut, budget card, bills, insights. Browser: KPIs reconcile after add/delete. Fixed: net worth ignored investment accounts (D-022); "No change" shown when there was no baseline. |
| 3 | Income management | Tested | Ledger/unit + integration; liability accounts refused. |
| 4 | Expense management | Tested | Incl. refunds (D-007), card purchases. Browser add / validate / delete. |
| 5 | Transaction management | Tested | Filters, search, sort, pagination, edit re-posts atomically, duplicate, delete, tags, audit log. |
| 6 | Account management | Tested | CRUD, archive, presets, derived balances, liabilities. |
| 7 | Account transfers | Tested | Same and cross-currency, card repayment, never income/expense. |
| 8 | Budget management | Logic-tested | 7 integration + 12 unit tests. UI pages render; budget editing not clicked through. Perf: `listBudgets` recomputes every budget's detail (N+1). |
| 9 | Zero-based budgeting | Logic-tested | Unit + integration. |
| 10 | Savings goals | Logic-tested | Transfers vs earmarks, withdrawal caps, edits re-post. UI renders (empty state). |
| 11 | Emergency fund | Logic-tested | Target = essentials × months; months covered; dashboard insight. |
| 12 | Sinking funds | Logic-tested | Goal type SINKING_FUND. |
| 13 | Recurring transactions | Logic-tested | Idempotent processor, pause/resume, auto-pause; base-currency accounts only. |
| 14 | Bills & subscriptions | Logic-tested | One expense per payment, undo, skip, calendar. Fixed: paying from a different-currency account (D-023). |
| 15 | Debt & loan management | Tested | Loan terms, EMI split into principal transfer + interest expense, payment history/undo, payoff date, remaining interest, snowball/avalanche planner, credit-card utilisation. 10 unit + 5 integration tests; browser flow reconciled on the dashboard. Gaps: card rates/minimums not recorded (D-028); no EMI reminders on the calendar yet. |
| 16 | Investment tracker | Tested | Holdings, buy/sell at average cost, recorded prices, market value, unrealised/realised gains, allocation, cash-funding check (D-029). 7 unit (incl. property) + 3 integration tests; browser: unfunded buy refused, buy → price → +20% gain → dashboard net worth reconciled; 375 px OK. Gaps: no automatic price feed (by design), no dividends shortcut (record as income). |
| 17 | Net worth tracker | Tested | `/net-worth`: balance sheet (cash, investments, other assets / cards, loans, other liabilities), month-end history with table view, change vs last month-end and 12 months ago; manual assets/liabilities with dated valuations (D-030). Dashboard KPI and trend use the same module. 3 unit + 3 integration tests; browser add → reconcile → delete; 375 px OK. |
| 18 | Financial calendar | Tested | `/calendar`: month grid (week start from settings), bills (paid/overdue/due/projected beyond horizon), recurring projections, EMIs (paid + due until payoff), goal target dates, daily spending; month totals; day agenda (D-031). 3 unit + 3 integration tests; browser render, day select, month navigation, 375 px OK. |
| 19 | Reports & analytics | Not started | Dashboard charts only; no reports page or export. |
| 20 | Financial insights | Tested | Rule-based, 11 unit tests; dismissal per browser (D-016). |
| 21 | Safe-to-spend | Tested | Dashboard card: amount (or shortfall) until the day before next income, per-day figure, expandable breakdown of accounts, commitments and goal savings (D-032). 3 unit + 2 integration tests; browser check with real data, 375 px OK. |
| 22 | What-if calculator | Not started | — |
| 23 | Cash-flow forecasting | Not started | Recurrence engine is ready to reuse. |
| 24 | Financial health score | Not started | Expense-to-income ratio exists in `domain/metrics`. |
| 25 | Settings & customisation | Tested | Profile, currency lock, timezone, formats, thresholds, theme, exchange rates. |
| 26 | Data import & export | Not started | — |
| 27 | Multi-currency | Partial | Per-account currency, recorded rates, conversions, cross-currency transfers. Recurring limited to base currency; foreign account opening balances use latest rate in the trend. |
| 28 | Security & data isolation | Tested | `requireUser` everywhere, `{id,userId}` scoping, RLS on all tables, isolation tests, open redirect fixed, dev bypass hardened. Gaps: no CSP; no app-level rate limiting (Supabase limits auth). |
| 29 | Responsive design | Tested | No horizontal overflow on any page at 375 / 768; bottom nav + drawer. |
| 30 | SaaS readiness | Partial / Blocked (external) | Multi-tenant, cron. Missing: account deletion + data export, password reset, monitoring. **External:** production Supabase project + migrations, Supabase email templates for `/auth/confirm`, `CRON_SECRET` on Vercel. |

## Phase 0 — Setup

- [x] Scaffold Next.js 16.4 + TypeScript strict + Tailwind v4 + shadcn/ui (Radix)
- [x] Install Prisma 7, Supabase SSR, Zod, decimal.js, date-fns, Vitest, fast-check
- [x] Local Postgres via `prisma dev` (D-008)
- [x] Env schema validation (`src/server/env.ts`)
- [x] Scripts: `typecheck`, `test`, `test:unit`, `test:integration`, `lint`, `db:*`

## Phase 1 — Foundation

- [x] Prisma schema (User, UserSettings, Account, Category, Transaction, LedgerEntry, AuditLog) + migration with RLS + CHECK constraints
- [x] `domain/money` + unit tests
- [x] `domain/ledger` + unit and property tests (PRD §26 scenarios)
- [x] `domain/period` (timezone-aware periods) + tests
- [x] Supabase Auth: login, signup, magic link, callback + token-hash confirm, logout, `proxy.ts` session refresh — sign-up, email confirmation, password sign-in and first-login provisioning verified live
- [x] `requireUser()` + first-login provisioning (settings, default categories, Cash account)
- [x] Design tokens (light/dark), theme switcher, Money / KpiCard / EmptyState / FinanceIcon
- [x] App shell: collapsible sidebar, mobile bottom nav + drawer, active state, user menu
- [x] Accounts: create / edit / archive / delete-if-unused, presets (bKash/Nagad/Rocket), derived balances, totals
- [x] Categories: tree CRUD, custom subcategories, archive
- [x] Settings: profile, base currency, timezone, formats, week start, dashboard period, budget thresholds, theme
- [x] Integration tests: provisioning, ledger-derived balances, credit-card liability, archived exclusion, cross-user isolation, DB constraints, settings locks
- [x] Production build passes
- [x] Click-through in the browser: account create / edit / archive / restore, validation, categories + subcategories, preferences save + validation
- [x] Responsive pass at 375 / 768 / 1280: no horizontal overflow; tablet shows icon rail; drawer + bottom nav on mobile

### Phase 1 audit (2026-11-02)

- [x] All migrations applied; `prisma migrate diff` shows no drift between migrations and schema
- [x] RLS enabled on all 17 tables
- [x] Every server action goes through `defineAction` → `requireUser()`; updates/deletes filter by `{ id, userId }`
- [x] Money never passes through `Number()`/`parseFloat` on the server (display-only uses in charts/percentages)
- [x] Browser re-check: account create / validation / archive / delete, categories, settings, mobile 375 px
- [x] Fix: post-login `next` redirect accepted `/\evil.com` (open redirect) → `safeRedirectPath()` + unit tests
- [x] Fix: changing a group's income/expense kind ignored subcategory transactions, rules and bills → guard + integration test
- [x] Fix: delete-guard counts ran concurrently inside a DB transaction → sequential
- [x] Hardening: `NODE_ENV` defaults to `production`, so a missing value can't enable the dev auth bypass (D-009)
- [x] 101 tests passing; typecheck, lint and production build clean

## Phase 2 — Core Finance

- [x] Exchange rates: recorded per currency/date, latest-on-or-before rule, foreign balances converted, never guessed
- [x] Income / expense / transfer service (create, edit re-posts atomically, delete), tags, refunds
- [x] Credit-card flows: purchase = expense on the card, repayment = transfer (hint shown in the form)
- [x] Transaction history: filters (type, account, category incl. subcategories, period, custom dates, search), sort, pagination, day grouping, summary
- [x] Shared add/edit/duplicate composer; mobile "+" button in the bottom nav
- [x] Dashboard: 6 KPIs with same-days comparison, trend charts (income vs expenses, cash flow, savings, net worth) with table view, expense donut, budget utilization, recent transactions, rule-based insights (dismissible)
- [x] Budgets: weekly / monthly / annual / custom, category limits (group includes subcategories), planning lines, budget vs actual, last-period comparison, zero-based check, 50/30/20 and 70/20/10 targets, rollover, copy from previous budget
- [x] Tests: 74 passing (unit, property-based, integration incl. PRD §26 scenarios, credit card, multi-currency, budgets, dashboard, isolation)
- [x] Production build passes; all pages server-render without errors
- [x] Browser click-through: income, card repayment transfer, filters
- [ ] Browser click-through of dashboard charts and budget pages (app window was hidden)

## Phase 3 — Planning

- [x] Recurrence engine shared by recurring rules and bills (anchored dates, no month-end drift)
- [x] Savings goals: emergency fund (essentials × months), goals, sinking funds; contributions as transfers or earmarks; withdrawal caps; history
- [x] Recurring transactions: idempotent processor (unique rule + date), pause/resume without backfill, auto-pause when an occurrence can't post
- [x] Bills & subscriptions: materialised occurrences, pay (one expense per payment), undo, skip, calendar, monthly/annual subscription cost
- [x] Guards: goal transfers and bill expenses can't be edited out of sync; accounts/categories used by schedules can't be deleted
- [x] Daily maintenance on page load + `/api/cron/daily` (`CRON_SECRET`, Vercel Cron)
- [x] Dashboard: upcoming bills card; insights for overdue / due-soon bills and the emergency fund
- [x] Tests, lint, typecheck and production build pass
- [x] Code audit (full project audit, 2026-11-02); fix: bill paid from another-currency account (D-023)
- [ ] Browser click-through of goal, recurring and bill create/pay flows (pages render; flows covered by integration tests)

## Full project audit (2026-11-02)

- [x] All 103 tests pass after fixes (113 with the loan domain tests); typecheck, lint, production build clean; migrations match schema
- [x] Fix: net worth (KPI and trend) dropped money moved into investment accounts (D-022)
- [x] Fix: net worth trend included archived accounts while the KPI didn't
- [x] Fix: bill paid from a different-currency account posted the amount unconverted (D-023)
- [x] Fix: dashboard showed "No change" when the comparison period was empty
- [x] Browser: every route renders; add/validate/delete expense reconciles on the dashboard; 375 / 768 px pass

## Phase 4 — Debt, investments, net worth

- [x] Debt & loan management
  - [x] Domain: EMI, payment split, amortisation schedule, snowball/avalanche payoff (`domain/loans.ts`, 10 unit tests incl. property test)
  - [x] Migration `phase4_loans`: `LoanTerms`, `LoanPayment`, CHECK constraints, RLS (D-026, D-027)
  - [x] Services: terms, record/undo payment atomically; guards on transactions, accounts, categories
  - [x] `/debts` page: KPIs, loan cards, payment history, payoff planner, credit cards; nav enabled
  - [x] 5 integration tests (split, lender interest, undo, refusals, guards, isolation); browser: add terms → pay → dashboard reconciles → undo → cleanup; 375 px OK
- [x] Investment tracker
  - [x] Domain: average cost, valuation, uninvested cash (`domain/investments.ts`, 7 unit tests incl. property test)
  - [x] Migration `phase4_investments`: `Holding`, `HoldingTrade`, `HoldingPrice`, CHECK constraints, RLS
  - [x] Service: holdings, trades (oversell and unfunded-buy refused), prices; account guards
  - [x] Net worth KPI and trend use market value (D-029 replaces D-022); accounts page shows "worth"
  - [x] `/investments` page: KPIs, allocation, holdings with gains, trade history, stale/unpriced flags; nav enabled
  - [x] 3 integration tests; browser flow reconciled; test data removed
- [x] Net worth tracker
  - [x] Migration `phase4_net_worth`: `ManualItem`, `ManualValuation`, CHECK, RLS
  - [x] Shared `net-worth.query.ts` (series, manual net, balance sheet) replaces the dashboard's private trend (D-030)
  - [x] Service: items with first valuation, value updates, archive, delete; kind/currency locked
  - [x] `/net-worth` page + nav; dashboard caption updated
  - [x] 3 unit + 3 integration tests; browser flow reconciled; 375 px OK on /net-worth and /investments

## Phase 5 — Planning and insight

- [x] Financial calendar
  - [x] `domain/calendar.ts` (grid, EMI dates, totals) + `queries/calendar.query.ts`; no schema change (D-031)
  - [x] `/calendar` page + nav; phone layout keeps the grid in view
  - [x] 3 unit + 3 integration tests; browser check
- [x] Safe-to-spend (formula approved 2026-11-03)
  - [x] `domain/safe-to-spend.ts` + `queries/safe-to-spend.query.ts`; no schema change (D-032)
  - [x] Dashboard card with breakdown
  - [x] 3 unit + 2 integration tests; browser check
- [ ] Cash-flow forecasting — **next**
- [ ] Remaining Phase 5–6 modules: see ROADMAP.md
