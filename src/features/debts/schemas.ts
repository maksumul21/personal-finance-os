import { z } from "zod";

const money = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s৳]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 5000 or 5000.50")
      .refine((s) => /[1-9]/.test(s), "Amount must be greater than zero"),
  );

/** Blank → null. Zero allowed (e.g. an instalment with no interest). */
const optionalMoney = z
  .string()
  .optional()
  .transform((s) => (s ?? "").trim().replace(/[,\s৳]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a valid amount")]))
  .transform((s) => (s === "" ? null : s));

export const loanTermsSchema = z.object({
  accountId: z.uuid("Choose the loan account"),
  principal: money,
  annualRate: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,4})?$/, "Enter a rate like 9 or 9.5")
    .refine((s) => Number(s) <= 100, "Rate can be at most 100%"),
  termMonths: z.number().int("Whole months only").min(1, "At least 1 month").max(600, "At most 600 months"),
  firstPaymentDate: z.iso.date("Pick the first instalment date"),
  /** Blank = use the computed EMI. */
  emiAmount: optionalMoney,
  paymentAccountId: z.uuid("Choose the account you pay from"),
  interestCategoryId: z.uuid("Choose a category for interest"),
});
export type LoanTermsInput = z.input<typeof loanTermsSchema>;
export type LoanTermsValues = z.output<typeof loanTermsSchema>;

export const loanPaymentSchema = z.object({
  loanId: z.uuid(),
  date: z.iso.date("Pick the payment date"),
  /** Total paid this instalment (principal + interest). */
  amount: money,
  /** Interest as shown by the lender; blank = calculated from the outstanding balance. */
  interest: optionalMoney,
  /** Pay from a different account this time. */
  accountId: z.uuid().optional().or(z.literal("")),
});
export type LoanPaymentInput = z.input<typeof loanPaymentSchema>;
export type LoanPaymentValues = z.output<typeof loanPaymentSchema>;

export const idSchema = z.object({ id: z.uuid() });

/** Debt page search params. */
export const debtParamsSchema = z.object({
  extra: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,2})?$/)
    .optional()
    .catch(undefined),
});
