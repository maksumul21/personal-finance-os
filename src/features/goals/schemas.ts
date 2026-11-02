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

const optionalMoney = z
  .string()
  .optional()
  .transform((s) => (s ?? "").trim().replace(/[,\s৳]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a valid amount")]))
  .transform((s) => (s === "" ? null : s));

export const GOAL_TYPES = ["GOAL", "EMERGENCY_FUND", "SINKING_FUND"] as const;

export const goalFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60),
    goalType: z.enum(GOAL_TYPES),
    /** Not used for an emergency fund (derived from essentials × months). */
    targetAmount: optionalMoney,
    targetDate: z.iso.date("Pick a valid date").optional().or(z.literal("")),
    description: z.string().trim().max(280).default(""),
    icon: z.string().min(1).max(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
    linkedAccountId: z.uuid().optional().or(z.literal("")),
    essentialMonthly: optionalMoney,
    targetMonths: z.number().int().min(1, "At least 1 month").max(24, "At most 24 months").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.goalType === "EMERGENCY_FUND") {
      if (!v.essentialMonthly || !/[1-9]/.test(v.essentialMonthly)) {
        ctx.addIssue({ code: "custom", path: ["essentialMonthly"], message: "Enter your essential monthly expenses" });
      }
      if (!v.targetMonths) ctx.addIssue({ code: "custom", path: ["targetMonths"], message: "Choose how many months to cover" });
    } else {
      if (!v.targetAmount || !/[1-9]/.test(v.targetAmount)) {
        ctx.addIssue({ code: "custom", path: ["targetAmount"], message: "Enter a target amount" });
      }
      // PRD §8.1 / §8.5: goals and sinking funds have a target date.
      if (!v.targetDate) ctx.addIssue({ code: "custom", path: ["targetDate"], message: "Pick a target date" });
    }
  });
export type GoalFormInput = z.input<typeof goalFormSchema>;
export type GoalFormValues = z.output<typeof goalFormSchema>;

export const contributionSchema = z.object({
  goalId: z.uuid(),
  direction: z.enum(["DEPOSIT", "WITHDRAWAL"]),
  amount: money,
  date: z.iso.date("Pick a valid date"),
  notes: z.string().trim().max(280).default(""),
  /**
   * Deposit: the account the money comes from. Withdrawal: the account it goes to.
   * Empty = no money moves (the amount is already in the goal's account, or there is none).
   */
  accountId: z.uuid().optional().or(z.literal("")),
});
export type ContributionInput = z.input<typeof contributionSchema>;
export type ContributionValues = z.output<typeof contributionSchema>;

export const updateContributionSchema = z.object({
  id: z.uuid(),
  amount: money,
  date: z.iso.date("Pick a valid date"),
  notes: z.string().trim().max(280).default(""),
});

export const updateGoalSchema = z.object({ id: z.uuid(), values: goalFormSchema });
export const idSchema = z.object({ id: z.uuid() });
export const archiveGoalSchema = z.object({ id: z.uuid(), archived: z.boolean() });
