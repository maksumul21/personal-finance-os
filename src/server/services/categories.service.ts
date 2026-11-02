import "server-only";
import type { CategoryFormValues } from "@/features/categories/schemas";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";

/** Categories are two levels deep: a group and its subcategories (DECISIONS.md D-014). */
async function validateParent(tx: DbTx, userId: string, values: CategoryFormValues, selfId?: string) {
  if (!values.parentId) return;
  if (values.parentId === selfId) throw new UserFacingError("A category can't be its own parent.", "parentId");
  const parent = await tx.category.findFirst({ where: { id: values.parentId, userId } });
  if (!parent) throw new UserFacingError("Parent category not found.", "parentId");
  if (parent.parentId) throw new UserFacingError("Subcategories can't have their own subcategories.", "parentId");
  if (parent.kind !== values.kind) throw new UserFacingError("Parent must be the same type.", "parentId");
}

async function assertUniqueName(tx: DbTx, userId: string, values: CategoryFormValues, selfId?: string) {
  const clash = await tx.category.findFirst({
    where: {
      userId,
      kind: values.kind,
      parentId: values.parentId,
      name: { equals: values.name, mode: "insensitive" },
      ...(selfId ? { NOT: { id: selfId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new UserFacingError("A category with this name already exists here.", "name");
}

export async function createCategory(userId: string, values: CategoryFormValues) {
  return db.$transaction(async (tx) => {
    await validateParent(tx, userId, values);
    await assertUniqueName(tx, userId, values);
    const sortOrder = await tx.category.count({ where: { userId, kind: values.kind, parentId: values.parentId } });
    const category = await tx.category.create({ data: { userId, sortOrder, ...values } });
    await audit(tx, userId, "category.create", "Category", category.id, undefined, category);
    return { id: category.id };
  });
}

export async function updateCategory(userId: string, id: string, values: CategoryFormValues) {
  return db.$transaction(async (tx) => {
    const existing = await tx.category.findFirst({ where: { id, userId }, include: { _count: { select: { children: true, transactions: true } } } });
    if (!existing) throw new UserFacingError("Category not found.");
    if (existing.kind !== values.kind && existing._count.transactions > 0) {
      throw new UserFacingError("A category with transactions can't change between income and expense.", "kind");
    }
    if (values.parentId && existing._count.children > 0) {
      throw new UserFacingError("A category with subcategories can't be moved under another category.", "parentId");
    }
    await validateParent(tx, userId, values, id);
    await assertUniqueName(tx, userId, values, id);
    const updated = await tx.category.update({ where: { id: existing.id }, data: values });
    if (existing.kind !== values.kind) {
      await tx.category.updateMany({ where: { parentId: id, userId }, data: { kind: values.kind } });
    }
    await audit(tx, userId, "category.update", "Category", id, existing, updated);
    return { id };
  });
}

/** Archiving a group also archives its subcategories; history keeps pointing at them. */
export async function setCategoryArchived(userId: string, id: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    const existing = await tx.category.findFirst({ where: { id, userId } });
    if (!existing) throw new UserFacingError("Category not found.");
    if (!archived && existing.parentId) {
      const parent = await tx.category.findFirst({ where: { id: existing.parentId, userId } });
      if (parent?.isArchived) throw new UserFacingError(`Restore “${parent.name}” first.`);
    }
    await tx.category.updateMany({
      where: { userId, OR: [{ id }, ...(archived ? [{ parentId: id }] : [])] },
      data: { isArchived: archived },
    });
    await audit(tx, userId, archived ? "category.archive" : "category.unarchive", "Category", id);
    return { id };
  });
}

/** Only unused categories without subcategories can be deleted; otherwise archive. */
export async function deleteCategory(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.category.findFirst({
      where: { id, userId },
      include: { _count: { select: { children: true, transactions: true } } },
    });
    if (!existing) throw new UserFacingError("Category not found.");
    if (existing._count.children > 0) throw new UserFacingError("Delete or move its subcategories first.");
    if (existing._count.transactions > 0) {
      throw new UserFacingError("This category has transactions. Archive it instead to keep your history.");
    }
    await tx.category.delete({ where: { id: existing.id } });
    await audit(tx, userId, "category.delete", "Category", id, existing);
    return { id };
  });
}
