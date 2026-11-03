import { randomUUID } from "node:crypto";
import { buildPosting, type LedgerInput } from "@/domain/ledger";
import { dayToDb } from "@/domain/period";
import type { AccountFormValues } from "@/features/accounts/schemas";
import type { CategoryKind } from "@/generated/prisma/client";
import { db, type DbTx } from "@/server/db";
import { provisionUser } from "@/server/services/provisioning.service";
import { EXPENSE_FIXTURE, INCOME_FIXTURE, type FixtureCategory } from "../support/category-fixture";

const created: string[] = [];

async function seedCategories(tx: DbTx, userId: string, kind: CategoryKind, groups: FixtureCategory[]) {
  for (const [i, group] of groups.entries()) {
    const parent = await tx.category.create({
      data: { userId, kind, name: group.name, icon: group.icon, color: group.color, isEssential: group.isEssential ?? false, sortOrder: i },
    });
    if (group.children?.length) {
      await tx.category.createMany({
        data: group.children.map((child, j) => ({
          userId,
          kind,
          parentId: parent.id,
          name: child.name,
          icon: child.icon,
          color: group.color,
          isEssential: child.isEssential ?? false,
          sortOrder: j,
        })),
      });
    }
  }
}

/** A provisioned user exactly as sign-up leaves them: settings and a Cash account, no categories. */
export async function createBareUser() {
  const id = randomUUID();
  created.push(id);
  await db.$transaction((tx) => provisionUser(tx, { id, email: `${id}@test.pfos.localhost`, name: "Test" }));
  return id;
}

/** A provisioned user plus the fixture category tree, so tests can refer to categories by name. */
export async function createTestUser() {
  const id = await createBareUser();
  await db.$transaction(async (tx) => {
    await seedCategories(tx, id, "INCOME", INCOME_FIXTURE);
    await seedCategories(tx, id, "EXPENSE", EXPENSE_FIXTURE);
  });
  return id;
}

export async function cleanupTestUsers() {
  if (created.length === 0) return;
  const ids = created.splice(0);
  // Ledger entries restrict account deletion, so remove transactions first; the rest cascades.
  await db.transaction.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

export function accountValues(overrides: Partial<AccountFormValues> = {}): AccountFormValues {
  return {
    name: `Account ${randomUUID().slice(0, 6)}`,
    type: "BANK",
    provider: null,
    currency: "BDT",
    openingBalance: "0",
    openingDate: "2026-01-01",
    creditLimit: null,
    color: "#2563eb",
    icon: "landmark",
    description: "",
    includeInSafeToSpend: true,
    ...overrides,
  };
}

/**
 * Persists a posting the way the Phase 2 transaction service will (one DB transaction).
 * Kept in tests until that service exists, so balances can be verified end to end now.
 */
export async function postTransaction(userId: string, input: LedgerInput, opts: { categoryId?: string; date?: string } = {}) {
  const p = buildPosting(input);
  const date = dayToDb(opts.date ?? "2026-11-01");
  return db.$transaction(async (tx) => {
    const t = await tx.transaction.create({
      data: {
        userId,
        type: input.type,
        date,
        amount: p.amount.toFixed(2),
        currency: "BDT",
        exchangeRate: p.exchangeRate.toString(),
        baseAmount: p.baseAmount.toFixed(2),
        categoryId: input.type === "TRANSFER" ? null : opts.categoryId,
        isRefund: input.type === "EXPENSE" && !!input.isRefund,
      },
    });
    await tx.ledgerEntry.createMany({
      data: p.entries.map((e) => ({
        transactionId: t.id,
        userId,
        accountId: e.accountId,
        date,
        amount: e.amount.toFixed(2),
        baseAmount: e.baseAmount.toFixed(2),
      })),
    });
    return t;
  });
}

export async function anyCategory(userId: string, kind: "INCOME" | "EXPENSE") {
  return db.category.findFirstOrThrow({ where: { userId, kind, parentId: { not: null } } }).catch(() =>
    db.category.findFirstOrThrow({ where: { userId, kind } }),
  );
}
