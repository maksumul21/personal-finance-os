import "server-only";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, type DefaultCategory } from "@/domain/default-categories";
import { todayIn, dayToDb } from "@/domain/period";
import type { CategoryKind } from "@/generated/prisma/client";
import type { DbTx } from "../db";

export interface IdentityInput {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

const DEFAULT_TIMEZONE = "Asia/Dhaka";

async function seedCategories(tx: DbTx, userId: string, kind: CategoryKind, defaults: DefaultCategory[]) {
  for (const [i, group] of defaults.entries()) {
    const parent = await tx.category.create({
      data: {
        userId,
        kind,
        name: group.name,
        icon: group.icon,
        color: group.color,
        isEssential: group.isEssential ?? false,
        isDefault: true,
        sortOrder: i,
      },
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
          isDefault: true,
          sortOrder: j,
        })),
      });
    }
  }
}

/**
 * Creates the app-side user record on first sign-in: settings, default categories and a Cash
 * account. Idempotent — returns early if the user already exists.
 */
export async function provisionUser(tx: DbTx, identity: IdentityInput): Promise<void> {
  const existing = await tx.user.findUnique({ where: { id: identity.id }, select: { id: true } });
  if (existing) return;

  await tx.user.create({
    data: {
      id: identity.id,
      email: identity.email.toLowerCase(),
      name: identity.name ?? null,
      avatarUrl: identity.avatarUrl ?? null,
      timezone: DEFAULT_TIMEZONE,
      settings: { create: {} },
    },
  });
  await seedCategories(tx, identity.id, "INCOME", DEFAULT_INCOME_CATEGORIES);
  await seedCategories(tx, identity.id, "EXPENSE", DEFAULT_EXPENSE_CATEGORIES);
  await tx.account.create({
    data: {
      userId: identity.id,
      name: "Cash",
      type: "CASH",
      currency: "BDT",
      openingBalance: "0",
      openingDate: dayToDb(todayIn(DEFAULT_TIMEZONE)),
      icon: "banknote",
      color: "#16a34a",
    },
  });
}
