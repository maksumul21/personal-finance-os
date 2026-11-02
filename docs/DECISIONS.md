# Decisions & Assumptions Log

| ID | Date | Decision | Reason |
|---|---|---|---|
| D-001 | 2026-11-02 | Light double-entry ledger (`Transaction` + `LedgerEntry`) instead of a flat transaction table. | Transfers, credit cards, loans, cross-currency and net worth stay correct by construction. |
| D-002 | 2026-11-02 | Loan principal repayment = TRANSFER to the loan's liability account; only interest is an EXPENSE. "Loan Payments" category stays for untracked loans. | Principal reduces a liability; it is not consumption. |
| D-003 | 2026-11-02 | Credit-card debt appears in the Debt module through its linked credit-card account, never as a second record. | Prevents double counting. |
| D-004 | 2026-11-02 | Multi-tenant (open signup). | Default from plan. |
| D-005 | 2026-11-02 | Auth: email/password + magic link. Google OAuth can be added later. | Default from plan. |
| D-006 | 2026-11-02 | English UI for v1; number format option LAKH (৳1,00,000) or INTL (৳100,000). | Default from plan. |
| D-007 | 2026-11-02 | Refunds recorded as EXPENSE with `isRefund = true`; they reduce category spending. | Keeps refunds in the right category. |
| D-008 | 2026-11-02 | Local development and integration tests use `prisma dev` (embedded Postgres) because Docker is not installed. Production uses Supabase Postgres. | No Docker on the dev machine. |
| D-009 | 2026-11-02 | Dev-only auth bypass: when `NODE_ENV=development` and `DEV_AUTH_EMAIL` is set, requests act as that local user. Ignored, with an error logged, in any other environment. | Lets the app run locally before Supabase credentials exist. Never active in production builds. |
| D-010 | 2026-11-02 | Prisma 7.10.1 (stable) instead of the npm `latest` tag, which currently points to an 8.0 release candidate. | Stability. |
| D-011 | 2026-11-02 | Opening balance is a field on Account, not a transaction; it never counts as income. | Matches PRD §7.3 formula. |
| D-012 | 2026-11-02 | Transactions are hard-deleted (entries cascade) and recorded in `AuditLog`. Accounts and categories are archived. | Soft-deleted rows that a query forgets to filter cause wrong totals. |
| D-013 | 2026-11-02 | Account types: CASH, BANK, SAVINGS, MFS, CREDIT_CARD, LOAN, INVESTMENT, OTHER_ASSET. Nature (ASSET/LIABILITY) derived from type. bKash/Nagad/Rocket are MFS presets via `provider`. | PRD §7.1 + debt/investment design. |
| D-014 | 2026-11-02 | Category hierarchy limited to 2 levels (group → subcategory). | Matches PRD default categories; keeps budgeting roll-ups simple. |
| D-015 | 2026-11-02 | `cacheComponents` disabled (the Next 16.4 template enables it). | Every page renders per-user financial data on request; nothing is shareable across users to cache. Route `loading.tsx` files give instant navigation feedback. Revisit if static marketing pages are added. |
