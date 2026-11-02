"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import {
  createTransaction,
  deleteExchangeRate,
  deleteTransaction,
  recordExchangeRate,
  updateTransaction,
} from "@/server/services/transactions.service";
import {
  exchangeRateIdSchema,
  exchangeRateSchema,
  transactionFormSchema,
  transactionIdSchema,
  updateTransactionSchema,
} from "./schemas";

/** Every page that shows balances or totals derived from transactions. */
function refresh() {
  for (const path of ["/transactions", "/dashboard", "/accounts", "/budgets"]) revalidatePath(path, "layout");
}

export const createTransactionAction = defineAction(transactionFormSchema, async (values, user) => {
  const result = await createTransaction({ userId: user.id, baseCurrency: user.baseCurrency }, values);
  refresh();
  return result;
});

export const updateTransactionAction = defineAction(updateTransactionSchema, async ({ id, values }, user) => {
  const result = await updateTransaction({ userId: user.id, baseCurrency: user.baseCurrency }, id, values);
  refresh();
  return result;
});

export const deleteTransactionAction = defineAction(transactionIdSchema, async ({ id }, user) => {
  const result = await deleteTransaction({ userId: user.id, baseCurrency: user.baseCurrency }, id);
  refresh();
  return result;
});

export const recordExchangeRateAction = defineAction(exchangeRateSchema, async (values, user) => {
  const result = await recordExchangeRate({ userId: user.id, baseCurrency: user.baseCurrency }, values);
  refresh();
  revalidatePath("/settings");
  return result;
});

export const deleteExchangeRateAction = defineAction(exchangeRateIdSchema, async ({ id }, user) => {
  const result = await deleteExchangeRate({ userId: user.id, baseCurrency: user.baseCurrency }, id);
  refresh();
  revalidatePath("/settings");
  return result;
});
