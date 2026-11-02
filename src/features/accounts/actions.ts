"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import {
  createAccount,
  deleteAccount,
  setAccountArchived,
  updateAccount,
} from "@/server/services/accounts.service";
import { accountFormSchema, accountIdSchema, archiveAccountSchema, updateAccountSchema } from "./schemas";

function refresh() {
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export const createAccountAction = defineAction(accountFormSchema, async (values, user) => {
  const result = await createAccount(user.id, values);
  refresh();
  return result;
});

export const updateAccountAction = defineAction(updateAccountSchema, async ({ id, values }, user) => {
  const result = await updateAccount(user.id, id, values);
  refresh();
  return result;
});

export const archiveAccountAction = defineAction(archiveAccountSchema, async ({ id, archived }, user) => {
  const result = await setAccountArchived(user.id, id, archived);
  refresh();
  return result;
});

export const deleteAccountAction = defineAction(accountIdSchema, async ({ id }, user) => {
  const result = await deleteAccount(user.id, id);
  refresh();
  return result;
});
