import { z } from "zod";
import { CURRENCIES } from "@/lib/format";

export const DATE_FORMATS = ["dd MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"] as const;
export const DASHBOARD_PERIODS = ["THIS_MONTH", "LAST_MONTH", "LAST_3_MONTHS", "LAST_6_MONTHS", "THIS_YEAR"] as const;

export const profileSchema = z.object({
  name: z.string().trim().max(80, "Keep your name under 80 characters"),
});

export const preferencesSchema = z
  .object({
    baseCurrency: z.enum(CURRENCIES),
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    dateFormat: z.enum(DATE_FORMATS),
    numberFormat: z.enum(["LAKH", "INTL"]),
    weekStartsOn: z.number().int().min(0).max(6),
    dashboardPeriod: z.enum(DASHBOARD_PERIODS),
    budgetWarnPct: z.number().int().min(1).max(99),
    budgetCriticalPct: z.number().int().min(2).max(100),
  })
  .refine((v) => v.budgetWarnPct < v.budgetCriticalPct, {
    path: ["budgetCriticalPct"],
    message: "Critical threshold must be higher than the warning threshold",
  });

export const themeSchema = z.object({ theme: z.enum(["LIGHT", "DARK", "SYSTEM"]) });

export type PreferencesInput = z.input<typeof preferencesSchema>;
