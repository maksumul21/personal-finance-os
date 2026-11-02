"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import {
  createHolding,
  deleteHolding,
  deletePrice,
  deleteTrade,
  recordPrice,
  recordTrade,
  updateHolding,
} from "@/server/services/investments.service";
import { holdingSchema, idSchema, priceSchema, tradeSchema, updateHoldingSchema } from "./schemas";

/** Holdings change account values, so net worth on the dashboard and accounts page changes too. */
function refresh() {
  for (const path of ["/investments", "/dashboard", "/accounts"]) revalidatePath(path, "layout");
}

export const createHoldingAction = defineAction(holdingSchema, async (values, user) => {
  const r = await createHolding(user.id, values);
  refresh();
  return r;
});

export const updateHoldingAction = defineAction(updateHoldingSchema, async ({ id, values }, user) => {
  const r = await updateHolding(user.id, id, values);
  refresh();
  return r;
});

export const deleteHoldingAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteHolding(user.id, id);
  refresh();
  return r;
});

export const recordTradeAction = defineAction(tradeSchema, async (values, user) => {
  const r = await recordTrade(user.id, values);
  refresh();
  return r;
});

export const deleteTradeAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteTrade(user.id, id);
  refresh();
  return r;
});

export const recordPriceAction = defineAction(priceSchema, async (values, user) => {
  const r = await recordPrice(user.id, values);
  refresh();
  return r;
});

export const deletePriceAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deletePrice(user.id, id);
  refresh();
  return r;
});
