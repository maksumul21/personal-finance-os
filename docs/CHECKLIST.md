# Development Checklist

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
- [ ] Browser click-through of goals, recurring and bills pages
- [ ] Phase 3 audit (same scope as the Phase 1 audit)

## Phase 4–5 (not started)

Shown as "Soon" in the navigation: Debt Management, Investments, Net Worth, Financial Calendar, Reports & Analytics.
