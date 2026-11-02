import { z } from "zod";

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters"),
  kind: z.enum(["INCOME", "EXPENSE"]),
  parentId: z.uuid().nullable(),
  icon: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
  isEssential: z.boolean().default(false),
});

export type CategoryFormInput = z.input<typeof categoryFormSchema>;
export type CategoryFormValues = z.output<typeof categoryFormSchema>;

export const updateCategorySchema = z.object({ id: z.uuid(), values: categoryFormSchema });
export const categoryIdSchema = z.object({ id: z.uuid() });
export const archiveCategorySchema = z.object({ id: z.uuid(), archived: z.boolean() });
