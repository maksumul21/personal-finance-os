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
| 4 — Debt, investments, net worth | In progress: Debt & loan management done; **Investment tracker next** |
| 5–6 — Planning tools, reports, import/export, SaaS readiness | Not started |

Of the 30 PRD modules: 12 tested, 7 logic-tested, 5 partial, 6 not started (see CHECKLIST.md).
118 tests pass; typecheck, lint and `next build` are clean. Branch `phase-1/foundation`, no remote.

## Open items needing the product owner

- **Original PRD:** `docs/PRD.md` is a reconstruction. Please supply the approved text.
- **External configuration** before production: Supabase project and migrations, Supabase email
  templates pointing at `/auth/confirm`, `CRON_SECRET` on Vercel.

## Sessions

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

- The embedded `prisma dev` database (D-008) breaks when integration tests run while
  `next dev` is serving (`08P01 bind message…`, `Connection terminated`). Restart `next dev`
  after running tests. If the DB process itself died: `npm run db:dev` (on "Lock file is already
  being held", run `npx prisma dev --name pfos --detach` again once the old process is gone).
  Data survives.
- The `pg` deprecation warning in test output comes from inside `@prisma/adapter-pg`.
