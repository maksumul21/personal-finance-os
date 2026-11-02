import { z } from "zod";
import { amountString } from "@/features/transactions/schemas";

export const billFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    amount: amountString,
    categoryId: z.uuid("Choose a category"),
    paymentAccountId: z.uuid("Choose the account it's paid from"),
    /** "ONCE" for a one-off bill. */
    unit: z.enum(["ONCE", "WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.number().int().min(1).max(366),
    firstDueDate: z.iso.date("Pick the first due date"),
    endDate: z.iso.date("Pick a valid date").optional().or(z.literal("")),
    isSubscription: z.boolean().default(false),
    notes: z.string().trim().max(280).default(""),
  })
  .refine((v) => !v.endDate || v.endDate >= v.firstDueDate, { path: ["endDate"], message: "End must be after the first due date" });
export type BillFormInput = z.input<typeof billFormSchema>;
export type BillFormValues = z.output<typeof billFormSchema>;

export const updateBillSchema = z.object({ id: z.uuid(), values: billFormSchema });
export const billStatusSchema = z.object({ id: z.uuid(), status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]) });

export const payBillSchema = z.object({
  occurrenceId: z.uuid(),
  date: z.iso.date("Pick the payment date"),
  /** Override the account or amount for this payment only. */
  accountId: z.uuid().optional().or(z.literal("")),
  amount: amountString.optional().or(z.literal("")),
  /** true = the expense is already recorded elsewhere; just mark the bill paid. */
  alreadyRecorded: z.boolean().default(false),
});
export type PayBillValues = z.output<typeof payBillSchema>;

export const occurrenceIdSchema = z.object({ occurrenceId: z.uuid() });
export const idSchema = z.object({ id: z.uuid() });
