"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayIn } from "@/domain/period";
import { defineAction } from "@/server/action";
import {
  createBill,
  deleteBill,
  payBill,
  setBillStatus,
  setOccurrenceSkipped,
  unpayBill,
  updateBill,
} from "@/server/services/bills.service";
import { billFormSchema, billStatusSchema, idSchema, occurrenceIdSchema, payBillSchema, updateBillSchema } from "./schemas";

/** Paying creates an expense, so balances, budgets and history all change. */
function refresh() {
  for (const path of ["/bills", "/dashboard", "/transactions", "/accounts", "/budgets"]) revalidatePath(path, "layout");
}

const ctxOf = (user: { id: string; baseCurrency: string }) => ({ userId: user.id, baseCurrency: user.baseCurrency });

export const createBillAction = defineAction(billFormSchema, async (values, user) => {
  const r = await createBill(ctxOf(user), values, todayIn(user.timezone));
  refresh();
  return r;
});

export const updateBillAction = defineAction(updateBillSchema, async ({ id, values }, user) => {
  const r = await updateBill(ctxOf(user), id, values, todayIn(user.timezone));
  refresh();
  return r;
});

export const setBillStatusAction = defineAction(billStatusSchema, async ({ id, status }, user) => {
  const r = await setBillStatus(ctxOf(user), id, status, todayIn(user.timezone));
  refresh();
  return r;
});

export const deleteBillAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteBill(ctxOf(user), id);
  refresh();
  return r;
});

export const payBillAction = defineAction(payBillSchema, async (values, user) => {
  const r = await payBill(ctxOf(user), values);
  refresh();
  return r;
});

export const unpayBillAction = defineAction(occurrenceIdSchema, async ({ occurrenceId }, user) => {
  const r = await unpayBill(ctxOf(user), occurrenceId);
  refresh();
  return r;
});

export const skipBillAction = defineAction(
  occurrenceIdSchema.extend({ skipped: z.boolean() }),
  async ({ occurrenceId, skipped }, user) => {
    const r = await setOccurrenceSkipped(ctxOf(user), occurrenceId, skipped);
    refresh();
    return r;
  },
);
