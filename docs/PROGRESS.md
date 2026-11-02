# Progress Log

Session-by-session record of where work stands. `CHECKLIST.md` holds the item-level status;
this file says what happened, what's open, and where the next session should start.

## Current state (2026-11-02)

| Phase | Status |
|---|---|
| 0 — Setup | Done |
| 1 — Foundation | Done and audited |
| 2 — Core finance | Built; one browser click-through open; not yet audited |
| 3 — Planning (goals, recurring, bills) | Built; browser click-through and audit open |
| 4–5 — Debt, investments, net worth, calendar, reports | Not started |

Branch `phase-1/foundation` holds all work so far (no git remote yet). 101 tests pass
(unit + integration); typecheck, lint and `next build` are clean.

## Next steps

1. Phase 2 audit: same checks as Phase 1, plus the open dashboard/budget click-through.
   Known item to review: some components compute money for display (e.g. the budget
   difference in `features/budgets/components/budget-detail.tsx`), against architecture rule 1.
2. Phase 3 audit and click-through of goals, recurring and bills.
3. Then Phase 4.

## Sessions

### 2026-11-02 — Phase 1 verification and audit

- Re-ran everything against a fresh local DB: migrations in sync with the schema, 98/98 tests,
  build clean, browser click-through of accounts, categories, settings and mobile layout.
- Audit fixes (commit `f86f75c`): open redirect via `/\` in the post-login `next` parameter;
  category kind change ignoring subcategory usage; sequential queries inside DB transactions;
  `NODE_ENV` defaults to `production`. Three regression tests added (101 total).
- The `pg` "client is already executing a query" deprecation warning still appears in
  integration runs. It comes from inside `@prisma/adapter-pg`, not app code; revisit when
  upgrading Prisma or moving to `pg` 9.

### Environment notes

- `docs/PRD.md` is referenced (e.g. "PRD §26") but is not in the repository.
- The embedded `prisma dev` database (D-008) can crash under load, e.g. integration tests
  running while the dev server is in use. Symptoms: `08P01 bind message…` or
  `Connection terminated` errors. Recovery: `npm run db:dev` (if it reports a held lock, run
  `npx prisma dev --name pfos --detach` again once the old process is gone), then restart
  `next dev`. Data survives.
