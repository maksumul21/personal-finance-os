import { z } from "zod";
import { PERIOD_PRESETS, addDaysTo, resolvePreset, type Day, type Period } from "@/domain/period";

export const REPORT_PRESETS = [...PERIOD_PRESETS, "CUSTOM"] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

/** Custom ranges are capped so one report stays a reasonable query. */
const MAX_CUSTOM_DAYS = 366 * 5;

export const reportParamsSchema = z.object({
  preset: z.enum(REPORT_PRESETS).default("LAST_3_MONTHS").catch("LAST_3_MONTHS"),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
});
export type ReportParams = z.output<typeof reportParamsSchema>;

/** Resolves the requested period; an incomplete or invalid custom range falls back to this month. */
export function resolveReportPeriod(p: ReportParams, today: Day): { preset: ReportPreset; period: Period } {
  if (p.preset !== "CUSTOM") return { preset: p.preset, period: resolvePreset(p.preset, today) };
  if (!p.from || !p.to || p.from > p.to || addDaysTo(p.from, MAX_CUSTOM_DAYS) < p.to) {
    return { preset: "THIS_MONTH", period: resolvePreset("THIS_MONTH", today) };
  }
  return { preset: "CUSTOM", period: { start: p.from, end: p.to } };
}

/** Query string for a period, shared by the page and the CSV download. */
export function reportQuery(preset: ReportPreset, period: Period): string {
  const q = new URLSearchParams({ preset });
  if (preset === "CUSTOM") {
    q.set("from", period.start);
    q.set("to", period.end);
  }
  return q.toString();
}
