import "server-only";
import { cache } from "react";
import { accountNature, type AccountType } from "@/domain/accounts";
import { todayIn, type Day } from "@/domain/period";
import { db } from "../db";

export interface ComposerAccount {
  id: string;
  name: string;
  type: AccountType;
  isLiability: boolean;
  currency: string;
  icon: string;
  color: string;
  isArchived: boolean;
}

export interface ComposerCategory {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  icon: string;
  color: string;
  isArchived: boolean;
  /** Group name for subcategories, null for groups. */
  group: string | null;
}

export interface ComposerData {
  accounts: ComposerAccount[];
  categories: ComposerCategory[];
  baseCurrency: string;
  today: Day;
}

/** Everything the add/edit transaction form needs, loaded once per request in the app layout. */
export const getComposerData = cache(async (userId: string, baseCurrency: string, timezone: string): Promise<ComposerData> => {
  const [accounts, categories] = await Promise.all([
    db.account.findMany({
      where: { userId },
      orderBy: [{ isArchived: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, type: true, currency: true, icon: true, color: true, isArchived: true },
    }),
    db.category.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, icon: true, color: true, isArchived: true, parentId: true },
    }),
  ]);
  const groups = new Map(categories.filter((c) => !c.parentId).map((c) => [c.id, c]));
  // Order: each group followed by its subcategories.
  const ordered: ComposerCategory[] = [];
  for (const g of groups.values()) {
    ordered.push({ id: g.id, name: g.name, kind: g.kind, icon: g.icon, color: g.color, isArchived: g.isArchived, group: null });
    for (const c of categories) {
      if (c.parentId === g.id) {
        ordered.push({ id: c.id, name: c.name, kind: c.kind, icon: c.icon, color: c.color, isArchived: c.isArchived, group: g.name });
      }
    }
  }
  return {
    accounts: accounts.map((a) => ({ ...a, isLiability: accountNature(a.type) === "LIABILITY" })),
    categories: ordered,
    baseCurrency,
    today: todayIn(timezone),
  };
});
