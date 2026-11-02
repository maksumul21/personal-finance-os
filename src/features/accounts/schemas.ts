import { z } from "zod";
import { ACCOUNT_TYPES } from "@/domain/accounts";
import { CURRENCIES } from "@/lib/format";

export const MFS_PROVIDERS = ["BKASH", "NAGAD", "ROCKET", "OTHER"] as const;

/** Signed decimal string, up to 2 dp. Kept as a string so no float conversion ever happens. */
const signedAmount = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s৳]/g, ""))
  .pipe(z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 12500 or 12500.50"));

const optionalAmount = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s৳]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a positive amount")]))
  .transform((s) => (s === "" ? null : s));

export const accountFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60, "Keep the name under 60 characters"),
    type: z.enum(ACCOUNT_TYPES),
    provider: z.enum(MFS_PROVIDERS).nullable().optional(),
    currency: z.enum(CURRENCIES),
    /** Assets: the balance held. Liabilities: the amount owed (entered as a positive number). */
    openingBalance: signedAmount,
    openingDate: z.iso.date("Pick a valid date"),
    creditLimit: optionalAmount.optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
    icon: z.string().min(1).max(40),
    description: z.string().trim().max(280).optional().default(""),
    includeInSafeToSpend: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if ((v.type === "CREDIT_CARD" || v.type === "LOAN") && v.openingBalance.startsWith("-")) {
      ctx.addIssue({ code: "custom", path: ["openingBalance"], message: "Enter the amount owed as a positive number" });
    }
  });

export type AccountFormInput = z.input<typeof accountFormSchema>;
export type AccountFormValues = z.output<typeof accountFormSchema>;

export const updateAccountSchema = z.object({ id: z.uuid(), values: accountFormSchema });
export const accountIdSchema = z.object({ id: z.uuid() });
export const archiveAccountSchema = z.object({ id: z.uuid(), archived: z.boolean() });
