import "server-only";
import { cache } from "react";
import { db } from "../db";

export interface PreferencesDTO {
  name: string;
  email: string;
  baseCurrency: string;
  timezone: string;
  dateFormat: string;
  numberFormat: "LAKH" | "INTL";
  weekStartsOn: number;
  dashboardPeriod: "THIS_MONTH" | "LAST_MONTH" | "LAST_3_MONTHS" | "LAST_6_MONTHS" | "THIS_YEAR";
  theme: "LIGHT" | "DARK" | "SYSTEM";
  budgetWarnPct: number;
  budgetCriticalPct: number;
  hasTransactions: boolean;
}

export const getPreferences = cache(async (userId: string): Promise<PreferencesDTO> => {
  const [user, txCount] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, include: { settings: true } }),
    db.transaction.count({ where: { userId } }),
  ]);
  const s = user.settings;
  return {
    name: user.name ?? "",
    email: user.email,
    baseCurrency: user.baseCurrency,
    timezone: user.timezone,
    dateFormat: s?.dateFormat ?? "dd MMM yyyy",
    numberFormat: s?.numberFormat ?? "LAKH",
    weekStartsOn: s?.weekStartsOn ?? 6,
    dashboardPeriod: s?.dashboardPeriod ?? "THIS_MONTH",
    theme: s?.theme ?? "SYSTEM",
    budgetWarnPct: s?.budgetWarnPct ?? 70,
    budgetCriticalPct: s?.budgetCriticalPct ?? 90,
    hasTransactions: txCount > 0,
  };
});
