import { z } from "zod";

const money = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s৳]/g, ""))
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 5000 or 5000.50"));

const optionalMoney = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s৳]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a valid amount")]))
  .transform((s) => (s === "" ? null : s));

export const BUDGET_PERIODS = ["MONTHLY", "WEEKLY", "ANNUAL", "CUSTOM"] as const;
export const BUDGET_METHODS = ["STANDARD", "ZERO_BASED", "FIFTY_THIRTY_TWENTY", "SEVENTY_TWENTY_TEN"] as const;

export const budgetFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    periodType: z.enum(BUDGET_PERIODS),
    /** Any day in the period; for CUSTOM, the first day. */
    start: z.iso.date("Pick a date"),
    /** CUSTOM only. */
    end: z.iso.date("Pick an end date").optional().or(z.literal("")),
    method: z.enum(BUDGET_METHODS),
    incomeSource: z.enum(["PLANNED", "ACTUAL"]),
    plannedIncome: optionalMoney,
    /** Copy category limits (and planning lines) from this budget. */
    copyFromId: z.uuid().optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.periodType === "CUSTOM") {
      if (!v.end) ctx.addIssue({ code: "custom", path: ["end"], message: "Pick an end date" });
      else if (v.end < v.start) ctx.addIssue({ code: "custom", path: ["end"], message: "End must be on or after the start" });
    }
    if (v.incomeSource === "PLANNED" && !v.plannedIncome && v.method !== "STANDARD") {
      ctx.addIssue({ code: "custom", path: ["plannedIncome"], message: "Enter the income this budget plans to allocate" });
    }
  });
export type BudgetFormInput = z.input<typeof budgetFormSchema>;
export type BudgetFormValues = z.output<typeof budgetFormSchema>;

export const budgetSettingsSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(60),
  incomeSource: z.enum(["PLANNED", "ACTUAL"]),
  plannedIncome: optionalMoney,
});
export type BudgetSettingsInput = z.input<typeof budgetSettingsSchema>;

export const ALLOCATION_KINDS = ["EXPENSE_CATEGORY", "SAVINGS", "DEBT_REPAYMENT", "INVESTMENT"] as const;

export const allocationFormSchema = z
  .object({
    budgetId: z.uuid(),
    kind: z.enum(ALLOCATION_KINDS),
    categoryId: z.uuid().optional().or(z.literal("")),
    label: z.string().trim().max(60).optional().default(""),
    allocatedAmount: money,
    rolloverEnabled: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "EXPENSE_CATEGORY" && !v.categoryId) ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
    if (v.kind !== "EXPENSE_CATEGORY" && !v.label) ctx.addIssue({ code: "custom", path: ["label"], message: "Give this line a name" });
  });
export type AllocationFormInput = z.input<typeof allocationFormSchema>;
export type AllocationFormValues = z.output<typeof allocationFormSchema>;

export const updateAllocationSchema = z.object({
  id: z.uuid(),
  allocatedAmount: money,
  rolloverEnabled: z.boolean(),
  label: z.string().trim().max(60).optional(),
});
export const idSchema = z.object({ id: z.uuid() });
