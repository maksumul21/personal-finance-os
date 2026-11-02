import { z } from "zod";
import { amountString } from "@/features/transactions/schemas";

export const REPEAT_UNITS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export const recurringFormSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    amount: amountString,
    accountId: z.uuid("Choose an account"),
    toAccountId: z.uuid().optional().or(z.literal("")),
    categoryId: z.uuid().optional().or(z.literal("")),
    description: z.string().trim().max(140).default(""),
    unit: z.enum(REPEAT_UNITS),
    interval: z.number().int().min(1, "At least 1").max(366),
    startDate: z.iso.date("Pick a start date"),
    endDate: z.iso.date("Pick a valid date").optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.type === "TRANSFER") {
      if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose the account money arrives in" });
      else if (v.toAccountId === v.accountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose two different accounts" });
    } else if (!v.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
    }
    if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End must be after the start" });
  });
export type RecurringFormInput = z.input<typeof recurringFormSchema>;
export type RecurringFormValues = z.output<typeof recurringFormSchema>;

export const updateRecurringSchema = z.object({ id: z.uuid(), values: recurringFormSchema });
export const recurringStatusSchema = z.object({ id: z.uuid(), status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]) });
export const idSchema = z.object({ id: z.uuid() });
