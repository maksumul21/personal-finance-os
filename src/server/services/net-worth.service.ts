import "server-only";
import { dayToDb } from "@/domain/period";
import type { ManualItemValues, ValuationValues } from "@/features/net-worth/schemas";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";

async function ownedItem(tx: DbTx, userId: string, id: string) {
  const item = await tx.manualItem.findFirst({ where: { id, userId } });
  if (!item) throw new UserFacingError("Item not found.");
  return item;
}

function itemData(v: ManualItemValues) {
  return { name: v.name, kind: v.kind, category: v.category, currency: v.currency, notes: v.notes || null };
}

/** Creates the item with its first valuation, atomically. */
export async function createManualItem(userId: string, input: { item: ManualItemValues; value: string; date: string }) {
  return db.$transaction(async (tx) => {
    const item = await tx.manualItem.create({ data: { userId, ...itemData(input.item) } });
    await tx.manualValuation.create({ data: { userId, itemId: item.id, date: dayToDb(input.date), value: input.value } });
    await audit(tx, userId, "manual-item.create", "ManualItem", item.id, undefined, input);
    return { id: item.id };
  });
}

/** Asset/liability and currency are fixed once valued: changing them would rewrite history. */
export async function updateManualItem(userId: string, id: string, values: ManualItemValues) {
  return db.$transaction(async (tx) => {
    const before = await ownedItem(tx, userId, id);
    if (before.kind !== values.kind) throw new UserFacingError("An asset can't become a liability. Create a new item instead.", "kind");
    if (before.currency !== values.currency) {
      throw new UserFacingError("Currency can't change once values are recorded. Create a new item instead.", "currency");
    }
    await tx.manualItem.update({ where: { id: before.id }, data: itemData(values) });
    await audit(tx, userId, "manual-item.update", "ManualItem", id, before, values);
    return { id };
  });
}

export async function setManualItemArchived(userId: string, id: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    const before = await ownedItem(tx, userId, id);
    await tx.manualItem.update({ where: { id: before.id }, data: { isArchived: archived } });
    await audit(tx, userId, archived ? "manual-item.archive" : "manual-item.unarchive", "ManualItem", id);
    return { id };
  });
}

export async function deleteManualItem(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const before = await ownedItem(tx, userId, id);
    await tx.manualItem.delete({ where: { id: before.id } });
    await audit(tx, userId, "manual-item.delete", "ManualItem", id, before);
    return { id };
  });
}

/** Records (or corrects) the value on a date. Zero means sold or settled from that date. */
export async function recordValuation(userId: string, v: ValuationValues) {
  return db.$transaction(async (tx) => {
    const item = await ownedItem(tx, userId, v.itemId);
    const date = dayToDb(v.date);
    const saved = await tx.manualValuation.upsert({
      where: { itemId_date: { itemId: item.id, date } },
      create: { userId, itemId: item.id, date, value: v.value, note: v.note || null },
      update: { value: v.value, note: v.note || null },
    });
    await audit(tx, userId, "manual-item.value", "ManualValuation", saved.id, undefined, v);
    return { id: saved.id };
  });
}

/** An item keeps at least one valuation; delete the item itself to remove the last one. */
export async function deleteValuation(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const v = await tx.manualValuation.findFirst({ where: { id, userId } });
    if (!v) throw new UserFacingError("Value not found.");
    if ((await tx.manualValuation.count({ where: { itemId: v.itemId } })) <= 1) {
      throw new UserFacingError("This is the only value recorded. Delete the item instead.");
    }
    await tx.manualValuation.delete({ where: { id: v.id } });
    await audit(tx, userId, "manual-item.value.delete", "ManualValuation", id, v);
    return { id };
  });
}
