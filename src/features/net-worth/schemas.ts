import { z } from "zod";
import { CURRENCIES } from "@/lib/format";

export const ASSET_CATEGORIES = ["PROPERTY", "VEHICLE", "VALUABLES", "RECEIVABLE", "BUSINESS", "RETIREMENT", "OTHER"] as const;
export const LIABILITY_CATEGORIES = ["PERSONAL_DEBT", "TAX", "OTHER"] as const;
/** Mirrors the Prisma `ManualItemCategory` enum. */
export const ITEM_CATEGORIES = ["PROPERTY", "VEHICLE", "VALUABLES", "RECEIVABLE", "BUSINESS", "RETIREMENT", "PERSONAL_DEBT", "TAX", "OTHER"] as const;

const value = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s৳]/g, ""))
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 2500000 or 0 if sold or settled"));

export const manualItemSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60, "Keep the name under 60 characters"),
    kind: z.enum(["ASSET", "LIABILITY"]),
    category: z.enum(ITEM_CATEGORIES),
    currency: z.enum(CURRENCIES),
    notes: z.string().trim().max(280).default(""),
  })
  .refine((v) => (v.kind === "ASSET" ? (ASSET_CATEGORIES as readonly string[]) : (LIABILITY_CATEGORIES as readonly string[])).includes(v.category), {
    path: ["category"],
    message: "Pick a category for this type",
  });
export type ManualItemInput = z.input<typeof manualItemSchema>;
export type ManualItemValues = z.output<typeof manualItemSchema>;

/** Creating an item records its first valuation too, so it counts from day one. */
export const createManualItemSchema = z.object({
  item: manualItemSchema,
  value,
  date: z.iso.date("Pick the date of this value"),
});
export const updateManualItemSchema = z.object({ id: z.uuid(), values: manualItemSchema });
export const archiveManualItemSchema = z.object({ id: z.uuid(), archived: z.boolean() });

export const valuationSchema = z.object({
  itemId: z.uuid(),
  date: z.iso.date("Pick the date of this value"),
  value,
  note: z.string().trim().max(140).default(""),
});
export type ValuationValues = z.output<typeof valuationSchema>;

export const idSchema = z.object({ id: z.uuid() });
