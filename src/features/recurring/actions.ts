"use server";

import { revalidatePath } from "next/cache";
import { todayIn } from "@/domain/period";
import { defineAction } from "@/server/action";
import { createRecurring, deleteRecurring, setRecurringStatus, updateRecurring } from "@/server/services/recurring.service";
import { idSchema, recurringFormSchema, recurringStatusSchema, updateRecurringSchema } from "./schemas";

function refresh() {
  for (const path of ["/transactions", "/dashboard", "/accounts", "/budgets"]) revalidatePath(path, "layout");
}

export const createRecurringAction = defineAction(recurringFormSchema, async (values, user) => {
  const r = await createRecurring({ userId: user.id, baseCurrency: user.baseCurrency }, values, todayIn(user.timezone));
  refresh();
  return r;
});

export const updateRecurringAction = defineAction(updateRecurringSchema, async ({ id, values }, user) => {
  const r = await updateRecurring({ userId: user.id, baseCurrency: user.baseCurrency }, id, values, todayIn(user.timezone));
  refresh();
  return r;
});

export const setRecurringStatusAction = defineAction(recurringStatusSchema, async ({ id, status }, user) => {
  const r = await setRecurringStatus({ userId: user.id, baseCurrency: user.baseCurrency }, id, status, todayIn(user.timezone));
  refresh();
  return r;
});

export const deleteRecurringAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteRecurring({ userId: user.id, baseCurrency: user.baseCurrency }, id);
  refresh();
  return r;
});
