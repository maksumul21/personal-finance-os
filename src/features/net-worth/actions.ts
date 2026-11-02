"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import {
  createManualItem,
  deleteManualItem,
  deleteValuation,
  recordValuation,
  setManualItemArchived,
  updateManualItem,
} from "@/server/services/net-worth.service";
import { archiveManualItemSchema, createManualItemSchema, idSchema, updateManualItemSchema, valuationSchema } from "./schemas";

function refresh() {
  for (const path of ["/net-worth", "/dashboard"]) revalidatePath(path, "layout");
}

export const createManualItemAction = defineAction(createManualItemSchema, async (input, user) => {
  const r = await createManualItem(user.id, input);
  refresh();
  return r;
});

export const updateManualItemAction = defineAction(updateManualItemSchema, async ({ id, values }, user) => {
  const r = await updateManualItem(user.id, id, values);
  refresh();
  return r;
});

export const archiveManualItemAction = defineAction(archiveManualItemSchema, async ({ id, archived }, user) => {
  const r = await setManualItemArchived(user.id, id, archived);
  refresh();
  return r;
});

export const deleteManualItemAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteManualItem(user.id, id);
  refresh();
  return r;
});

export const recordValuationAction = defineAction(valuationSchema, async (values, user) => {
  const r = await recordValuation(user.id, values);
  refresh();
  return r;
});

export const deleteValuationAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteValuation(user.id, id);
  refresh();
  return r;
});
