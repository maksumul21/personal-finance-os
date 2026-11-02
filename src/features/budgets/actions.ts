"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import { getPreferences } from "@/server/queries/settings.query";
import {
  addAllocation,
  createBudget,
  deleteAllocation,
  deleteBudget,
  updateAllocation,
  updateBudgetSettings,
} from "@/server/services/budgets.service";
import { allocationFormSchema, budgetFormSchema, budgetSettingsSchema, idSchema, updateAllocationSchema } from "./schemas";

function refresh() {
  revalidatePath("/budgets", "layout");
  revalidatePath("/dashboard");
}

export const createBudgetAction = defineAction(budgetFormSchema, async (values, user) => {
  const prefs = await getPreferences(user.id);
  const result = await createBudget(user.id, values, prefs.weekStartsOn);
  refresh();
  return result;
});

export const updateBudgetSettingsAction = defineAction(budgetSettingsSchema, async (values, user) => {
  const result = await updateBudgetSettings(user.id, values);
  refresh();
  return result;
});

export const deleteBudgetAction = defineAction(idSchema, async ({ id }, user) => {
  const result = await deleteBudget(user.id, id);
  refresh();
  return result;
});

export const addAllocationAction = defineAction(allocationFormSchema, async (values, user) => {
  const result = await addAllocation(user.id, values);
  refresh();
  return result;
});

export const updateAllocationAction = defineAction(updateAllocationSchema, async (values, user) => {
  const result = await updateAllocation(user.id, values);
  refresh();
  return result;
});

export const deleteAllocationAction = defineAction(idSchema, async ({ id }, user) => {
  const result = await deleteAllocation(user.id, id);
  refresh();
  return result;
});
