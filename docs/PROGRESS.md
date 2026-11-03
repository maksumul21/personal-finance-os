# Progress Log

Session-by-session record of where work stands. `CHECKLIST.md` holds per-feature status,
`ROADMAP.md` the plan, `DECISIONS.md` the decisions.

## Current state (2026-11-02, after the full project audit)

| Phase | Status |
|---|---|
| 0 — Setup | Done |
| 1 — Foundation | Done and audited |
| 2 — Core finance | Done and audited (logic + browser) |
| 3 — Goals, recurring, bills | Logic audited and integration-tested; UI create/pay flows not clicked through |
| 4 — Debt, investments, net worth | Done and tested |
| 5 — Planning tools and reports | In progress: calendar and safe-to-spend done; **Cash-flow forecasting next** |
| 6 — Import/export, SaaS readiness | Not started |

Of the 30 PRD modules: 16 tested, 7 logic-tested, 3 partial, 4 not started (see CHECKLIST.md).
145 tests pass; typecheck, lint and `next build` are clean. Branch `phase-1/foundation`, no remote.

## Open items needing the product owner

- **Original PRD:** `docs/PRD.md` is a reconstruction. Please supply the approved text.
- **External configuration** before production: Supabase project and migrations, Supabase email
  templates pointing at `/auth/confirm`, `CRON_SECRET` on Vercel.

## Sessions

### 2026-11-03 — Safe-to-spend (Phase 5, module 2)

- Formula approved by the product owner (D-032). `domain/safe-to-spend.ts`,
  `queries/safe-to-spend.query.ts`, dashboard card with an expandable breakdown; no schema change.
- Tests: 3 unit + 2 integration; 145 total pass. Browser with real data: only Cash (−৳150) is marked
  spendable, so the card shows a ৳150 shortfall with "Your spendable accounts are below zero."
  (wording fixed during the check); 375 px OK.
- Not committed (awaiting approval).

### 2026-11-02 — Financial calendar (Phase 5, module 1)

- `domain/calendar.ts`, `queries/calendar.query.ts`, `/calendar` page; no schema change (D-031).
- Tests: 3 unit + 3 integration; 140 total pass. Browser: renders with real data (৳215 spent today),
  day selection, month navigation, 375 px OK.
- **Correction:** `DEV_AUTH_EMAIL` in `.env` is empty, so the dev auth bypass is off and the app runs on
  real Supabase sign-in (pages load through the browser's Supabase session). Earlier notes saying
  live sign-in couldn't be exercised because of the bypass were wrong. An intermittent redirect to
  sign-in was observed; logged in ROADMAP technical debt.
- Not committed (awaiting approval).

### 2026-11-02 — Net worth tracker (Phase 4, module 3)

- Migration `phase4_net_worth`: `ManualItem`, `ManualValuation` (CHECK, RLS).
- `domain/net-worth.ts`, shared `queries/net-worth.query.ts` (month-end series, manual net,
  balance sheet; the dashboard now uses it), `services/net-worth.service.ts`, `/net-worth` page.
- Tests: 3 unit + 3 integration; 134 total pass. Browser: added a ৳10,00,000 asset, net worth on
  the page and dashboard rose by exactly that; deleted it; 375 px OK (also /investments).
- Phase 4 complete. Not committed (awaiting approval).

### 2026-11-02 — Investment tracker (Phase 4, module 2)

- Migration `phase4_investments`: `Holding`, `HoldingTrade`, `HoldingPrice` (CHECKs, RLS).
- `domain/investments.ts` (average cost, valuation, uninvested cash), `services/investments.service.ts`
  (holdings, trades with oversell/unfunded-buy checks, prices), `queries/investments.query.ts`,
  shared `queries/holdings.data.ts`, `/investments` page.
- Net worth KPI and month-end trend now value investment accounts at market (D-029, replaces D-022).
- Tests: 7 unit + 3 integration; 128 total pass. Browser: unfunded buy refused ("short by 5000.00"),
  buy 10 @ ৳1,000, price ৳1,200 → +৳2,000 (+20%), dashboard net worth +৳22,000 with expenses
  unchanged. Test data removed with a one-off script after the app window was hidden.
- Not committed (awaiting approval). Mobile layout of `/investments` not re-checked.

### 2026-11-02 — Debt & loan management (Phase 4, module 1)

- Schema approved by the product owner. Migration `phase4_loans`: `LoanTerms`, `LoanPayment`
  with CHECK constraints and RLS (D-026, D-027).
- `services/loans.service.ts`: save/remove terms, record/undo a payment (principal transfer +
  interest expense, atomic). Guards added to transactions, accounts and categories services.
- `queries/debts.query.ts` + `/debts` page: totals, loan cards (repaid %, next due, payoff date,
  remaining interest), payment history, snowball/avalanche planner (D-028), credit cards.
- Tests: 5 integration tests (`tests/integration/debts.test.ts`); 118 total pass. Fixed during
  testing: an overpayment was being silently trimmed; now refused.
- Browser: created a test loan (৳5,00,000, 12%, 24 months), EMI preview ৳23,536.74, payment
  split ৳5,000 interest / ৳18,536.74 principal; dashboard expenses rose by the interest only;
  undo restored balances; test data removed. 375 px: no overflow.
- Not committed (awaiting approval).

### 2026-11-02 — Full end-to-end audit

- Re-read docs, schema (17 models, 5 migrations), all services, queries and domain modules.
- Ran everything: 103/103 tests, typecheck, lint, build, schema drift check, every route in the
  browser, an expense add/validate/delete flow reconciled against the dashboard, and responsive
  checks at 375 / 768 px.
- Fixes (uncommitted, awaiting approval):
  - Net worth KPI and trend now include investment accounts at ledger value and exclude
    archived accounts consistently (D-022). Unit test added.
  - Bills can't be paid from an account in another currency (D-023). Integration test added.
  - Dashboard shows "Nothing in … to compare" instead of "No change" when the previous period was empty.
- The four previously approved fixes were already committed in `f86f75c` (D-024, D-025).
- Started Debt & loan management: pure domain layer `src/domain/loans.ts` (EMI, payment split,
  amortisation, snowball/avalanche) with 10 unit tests. Next: loan-terms schema (needs approval).
- Totals now: 73 unit + 40 integration = 113 tests passing.

### 2026-11-02 — Phase 1 verification and audit

- 98/98 tests, build clean, browser click-through of accounts, categories, settings, mobile.
- Fixes (commit `f86f75c`): open redirect via `/\`; category kind change ignoring subcategory
  usage; sequential queries inside DB transactions; `NODE_ENV` defaults to `production`.

## Environment notes

- Auth: `.env` has `DEV_AUTH_EMAIL` empty, so local runs use real Supabase auth. Requests without
  a session cookie (e.g. curl) are redirected to `/login`.

- The embedded `prisma dev` database (D-008) breaks when integration tests run while
  `next dev` is serving (`08P01 bind message…`, `Connection terminated`). Restart `next dev`
  after running tests. If the DB process itself died: `npm run db:dev` (on "Lock file is already
  being held", run `npx prisma dev --name pfos --detach` again once the old process is gone).
  Data survives.
- The `pg` deprecation warning in test output comes from inside `@prisma/adapter-pg`.
