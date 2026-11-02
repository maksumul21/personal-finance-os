"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import {
  createCategory,
  deleteCategory,
  setCategoryArchived,
  updateCategory,
} from "@/server/services/categories.service";
import { archiveCategorySchema, categoryFormSchema, categoryIdSchema, updateCategorySchema } from "./schemas";

const refresh = () => revalidatePath("/settings/categories");

export const createCategoryAction = defineAction(categoryFormSchema, async (values, user) => {
  const result = await createCategory(user.id, values);
  refresh();
  return result;
});

export const updateCategoryAction = defineAction(updateCategorySchema, async ({ id, values }, user) => {
  const result = await updateCategory(user.id, id, values);
  refresh();
  return result;
});

export const archiveCategoryAction = defineAction(archiveCategorySchema, async ({ id, archived }, user) => {
  const result = await setCategoryArchived(user.id, id, archived);
  refresh();
  return result;
});

export const deleteCategoryAction = defineAction(categoryIdSchema, async ({ id }, user) => {
  const result = await deleteCategory(user.id, id);
  refresh();
  return result;
});
