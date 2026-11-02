"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import { deleteLoanPayment, deleteLoanTerms, recordLoanPayment, saveLoanTerms } from "@/server/services/loans.service";
import { idSchema, loanPaymentSchema, loanTermsSchema } from "./schemas";

/** Payments move money and post an expense, so balances, history and budgets change too. */
function refresh() {
  for (const path of ["/debts", "/dashboard", "/accounts", "/transactions", "/budgets"]) revalidatePath(path, "layout");
}

export const saveLoanTermsAction = defineAction(loanTermsSchema, async (values, user) => {
  const r = await saveLoanTerms({ userId: user.id, baseCurrency: user.baseCurrency }, values);
  refresh();
  return r;
});

export const deleteLoanTermsAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteLoanTerms({ userId: user.id, baseCurrency: user.baseCurrency }, id);
  refresh();
  return r;
});

export const recordLoanPaymentAction = defineAction(loanPaymentSchema, async (values, user) => {
  const r = await recordLoanPayment({ userId: user.id, baseCurrency: user.baseCurrency }, values);
  refresh();
  return r;
});

export const deleteLoanPaymentAction = defineAction(idSchema, async ({ id }, user) => {
  const r = await deleteLoanPayment({ userId: user.id, baseCurrency: user.baseCurrency }, id);
  refresh();
  return r;
});
