import { z } from "zod";

/** Positive decimal string, up to 2 dp. Grouping commas and ৳ are stripped. */
export const amountString = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s৳]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 1500 or 1500.50")
      .refine((s) => /[1-9]/.test(s), "Amount must be greater than zero"),
  );

const optionalAmount = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s৳]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a valid amount")]))
  .transform((s) => (s === "" ? undefined : s));

const optionalRate = z
  .string()
  .trim()
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{1,10}(\.\d{1,8})?$/, "Enter a rate like 121.50")]))
  .transform((s) => (s === "" ? undefined : s))
  .refine((s) => s === undefined || /[1-9]/.test(s), "Rate must be greater than zero");

const common = {
  date: z.iso.date("Pick a valid date"),
  description: z.string().trim().max(140, "Keep it under 140 characters").default(""),
  notes: z.string().trim().max(1000, "Keep notes under 1000 characters").default(""),
  tags: z
    .array(z.string().trim().min(1).max(30, "Tags are at most 30 characters"))
    .max(10, "Up to 10 tags")
    .default([]),
  /** Only needed when the account isn't in the base currency and no rate is recorded for the date. */
  exchangeRate: optionalRate.optional(),
};

export const transactionFormSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("INCOME"),
    accountId: z.uuid("Choose an account"),
    categoryId: z.uuid("Choose a category"),
    amount: amountString,
    ...common,
  }),
  z.object({
    type: z.literal("EXPENSE"),
    accountId: z.uuid("Choose an account"),
    categoryId: z.uuid("Choose a category"),
    amount: amountString,
    isRefund: z.boolean().default(false),
    ...common,
  }),
  z
    .object({
      type: z.literal("TRANSFER"),
      fromAccountId: z.uuid("Choose the account money leaves"),
      toAccountId: z.uuid("Choose the account money arrives in"),
      amount: amountString,
      /** Amount received, only when the two accounts use different currencies. */
      toAmount: optionalAmount.optional(),
      ...common,
    })
    .refine((v) => v.fromAccountId !== v.toAccountId, {
      path: ["toAccountId"],
      message: "Choose two different accounts",
    }),
]);

export type TransactionFormInput = z.input<typeof transactionFormSchema>;
export type TransactionFormValues = z.output<typeof transactionFormSchema>;

export const updateTransactionSchema = z.object({ id: z.uuid(), values: transactionFormSchema });
export const transactionIdSchema = z.object({ id: z.uuid() });

export const exchangeRateSchema = z.object({
  currency: z.string().length(3),
  date: z.iso.date("Pick a valid date"),
  rate: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,8})?$/, "Enter a rate like 121.50")
    .refine((s) => /[1-9]/.test(s), "Rate must be greater than zero"),
});
export const exchangeRateIdSchema = z.object({ id: z.uuid() });

/** URL search params for the history page. Invalid values fall back to defaults. */
export const TX_SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const;
export const transactionFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional().catch(undefined),
  account: z.uuid().optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  sort: z.enum(TX_SORTS).default("date_desc").catch("date_desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type TransactionFilters = z.output<typeof transactionFiltersSchema>;
