# Personal Finance OS — Architecture

Approved 2026-11-02. This is the reference for how the system is built; `DECISIONS.md` records
assumptions and `CHECKLIST.md` tracks progress.

## Stack

Next.js 16 (App Router, Turbopack, `proxy.ts`) · React 19 · TypeScript strict · Tailwind v4 ·
shadcn-style primitives · Lucide · Recharts · Prisma 7 (`@prisma/adapter-pg`) · PostgreSQL
(Supabase in production, `prisma dev` locally) · Supabase Auth (`@supabase/ssr`) · Zod ·
react-hook-form · decimal.js · date-fns + @date-fns/tz · Vitest + fast-check.

## Layers

```
app/ (routes, RSC pages)          — render read-models, never compute money
features/<module>/actions.ts      — 'use server': requireUser → Zod → service → revalidate
server/services/*                 — use-cases, own prisma.$transaction, always scoped by userId
server/queries/*                  — read-models, SQL aggregation
domain/*                          — PURE functions (no I/O), fully unit-tested
```

Rules:

1. Components never compute money. They format values that queries already calculated.
2. `userId` always comes from the session (`requireUser()`), never from client input.
3. Every update/delete filters by `{ id, userId }`.
4. Money is `NUMERIC(19,4)` in Postgres, `Decimal` in the domain and services, and a `string` when sent to the client.
   Never `Number()`/`parseFloat` on money.

## Ledger model

- `Transaction`: the user-facing event (INCOME / EXPENSE / TRANSFER), `date` is a Postgres `DATE`.
- `LedgerEntry`: signed postings, one per affected account, in that account's currency.

Sign convention: every balance means "money I hold here". Liabilities (credit card, loan) are
normally negative; **liability outstanding = −balance**.

```
account balance = openingBalance + Σ ledgerEntry.amount
total balance   = Σ balances of active ASSET accounts (excl. INVESTMENT)
net worth       = Σ active non-investment account balances
                + Σ investment holding values + Σ manual assets − Σ manual liabilities
```

| Event | Entries | Income/expense |
|---|---|---|
| Income to Bank | Bank +x | income +x |
| Expense from bKash | bKash −x | expense +x |
| Transfer A→B | A −x, B +y (y = x unless cross-currency) | none |
| Credit-card purchase | Card −x | expense +x |
| Credit-card repayment | Bank −x, Card +x (TRANSFER) | none |
| Loan EMI | principal TRANSFER Bank→Loan + interest EXPENSE | interest only |

Invariants (enforced in `domain/ledger` and tested with property tests):
INCOME/EXPENSE have exactly 1 entry; TRANSFER has exactly 2 entries on different accounts;
TRANSFER has no category; INCOME/EXPENSE require a category whose kind matches.

## Dates

`Transaction.date` is a calendar `DATE`. "Today"/"this month" resolve in the user's timezone
(default `Asia/Dhaka`) through `domain/period`.

## Security

- Supabase Auth; `src/proxy.ts` refreshes the session and redirects unauthenticated users.
- Authorization is re-checked in every server action and query (`requireUser()`).
- Migrations enable RLS (no policies) on all tables so the Supabase Data API exposes nothing;
  Prisma connects as the table owner.
- Dev-only auth bypass (`DEV_AUTH_EMAIL`) works only when `NODE_ENV=development` and is refused
  otherwise — see DECISIONS.md D-009.

## Idempotency

- `Transaction` unique `(recurringRuleId, occurrenceDate)`.
- `BillOccurrence` unique `(billId, dueDate)`, unique `transactionId`.

## Folder structure

```
prisma/            schema.prisma, migrations/, seed
src/app/           (auth)/…, (app)/<module>/…, api/…
src/domain/        money, ledger, period, metrics, budget, recurrence, …
src/server/        db.ts, auth.ts, services/, queries/
src/features/      <module>/{actions.ts, schemas.ts, components/}
src/components/    ui/ (primitives), finance/, layout/, charts/
src/lib/           supabase clients, utils, formatting
tests/             unit/, integration/
```
