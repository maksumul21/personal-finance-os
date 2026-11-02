import "server-only";
import type { CategoryKind } from "@/generated/prisma/client";
import { db } from "../db";

export interface CategoryDTO {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  icon: string;
  color: string;
  isDefault: boolean;
  isEssential: boolean;
  isArchived: boolean;
  transactionCount: number;
}

export interface CategoryGroupDTO extends CategoryDTO {
  children: CategoryDTO[];
}

/** Two-level category tree for one kind, groups and children in their saved order. */
export async function getCategoryTree(userId: string, kind: CategoryKind): Promise<CategoryGroupDTO[]> {
  const rows = await db.category.findMany({
    where: { userId, kind },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });
  const toDTO = (c: (typeof rows)[number]): CategoryDTO => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
    icon: c.icon,
    color: c.color,
    isDefault: c.isDefault,
    isEssential: c.isEssential,
    isArchived: c.isArchived,
    transactionCount: c._count.transactions,
  });
  const groups = rows.filter((c) => !c.parentId).map((c) => ({ ...toDTO(c), children: [] as CategoryDTO[] }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const c of rows) if (c.parentId) byId.get(c.parentId)?.children.push(toDTO(c));
  return groups;
}
