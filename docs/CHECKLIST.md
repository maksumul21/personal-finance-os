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

## Phase 3–5

See ARCHITECTURE.md.
