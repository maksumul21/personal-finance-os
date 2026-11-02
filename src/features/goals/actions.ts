"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import {
  addContribution,
  createGoal,
  deleteContribution,
  deleteGoal,
  setGoalArchived,
  updateContribution,
  updateGoal,
} from "@/server/services/goals.service";
import { archiveGoalSchema, contributionSchema, goalFormSchema, idSchema, updateContributionSchema, updateGoalSchema } from "./schemas";

/** Contributions with a source account move money, so balances and history change too. */
function refresh() {
  for (const path of ["/goals", "/dashboard", "/accounts", "/transactions"]) revalidatePath(path, "layout");
}

export const createGoalAction = defineAction(goalFormSchema, async (values, user) => {
  const r = await createGoal(user.id, values);
  refresh();
  return r;
});

export const updateGoalAction = defineAction(updateGoalSchema, async ({ id, values }, user) => {
  const r = await updateGoal(user.id, id, values);
  refresh();
  return r;
});

export const archiveGoalAction = defineAction(archiveGoalSchema, async ({ id, archived }, user) => {
  const r = await setGoalArchived(user.id, id, archived);
  refresh();
  return r;
});

export const deleteGoalAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteGoal(user.id, id);
  refresh();
  return r;
});

export const addContributionAction = defineAction(contributionSchema, async (values, user) => {
  const r = await addContribution({ userId: user.id, baseCurrency: user.baseCurrency }, values);
  refresh();
  return r;
});

export const updateContributionAction = defineAction(updateContributionSchema, async (values, user) => {
  const r = await updateContribution({ userId: user.id, baseCurrency: user.baseCurrency }, values);
  refresh();
  return r;
});

export const deleteContributionAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteContribution({ userId: user.id, baseCurrency: user.baseCurrency }, id);
  refresh();
  return r;
});
