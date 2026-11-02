import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
} from "date-fns";

/**
 * Calendar-day handling. A "Day" is an ISO date string (YYYY-MM-DD) with no time or zone,
 * matching Postgres DATE. "Today" and period boundaries resolve in the user's timezone.
 */
export type Day = string;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: string): value is Day {
  if (!DAY_RE.test(value)) return false;
  const d = parseISO(value);
  return !Number.isNaN(d.getTime()) && format(d, "yyyy-MM-dd") === value;
}

export function todayIn(timeZone: string, now: Date = new Date()): Day {
  return format(new TZDate(now, timeZone), "yyyy-MM-dd");
}

/** Prisma maps @db.Date to a JS Date at UTC midnight. */
export function dayToDb(day: Day): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function dbToDay(date: Date): Day {
  return date.toISOString().slice(0, 10);
}

export interface Period {
  /** Inclusive. */
  start: Day;
  /** Inclusive. */
  end: Day;
}

export const PERIOD_PRESETS = [
  "THIS_MONTH",
  "LAST_MONTH",
  "LAST_3_MONTHS",
  "LAST_6_MONTHS",
  "THIS_YEAR",
  "LAST_YEAR",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** Works on a local date built from the Day so no timezone shifting can happen. */
function local(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDay(date: Date): Day {
  return format(date, "yyyy-MM-dd");
}

export function monthOf(day: Day, offsetMonths = 0): Period {
  const base = addMonths(startOfMonth(local(day)), offsetMonths);
  return { start: toDay(base), end: toDay(endOfMonth(base)) };
}

export function resolvePreset(preset: PeriodPreset, today: Day): Period {
  const t = local(today);
  switch (preset) {
    case "THIS_MONTH":
      return monthOf(today);
    case "LAST_MONTH":
      return monthOf(today, -1);
    case "LAST_3_MONTHS":
      return { start: toDay(addMonths(startOfMonth(t), -2)), end: toDay(endOfMonth(t)) };
    case "LAST_6_MONTHS":
      return { start: toDay(addMonths(startOfMonth(t), -5)), end: toDay(endOfMonth(t)) };
    case "THIS_YEAR":
      return { start: toDay(startOfYear(t)), end: toDay(endOfYear(t)) };
    case "LAST_YEAR": {
      const ly = new Date(t.getFullYear() - 1, 0, 1);
      return { start: toDay(startOfYear(ly)), end: toDay(endOfYear(ly)) };
    }
  }
}

/** Number of calendar days in a period, inclusive of both ends. */
export function daysInPeriod(period: Period): number {
  return differenceInCalendarDays(local(period.end), local(period.start)) + 1;
}

export function addDaysTo(day: Day, days: number): Day {
  return toDay(addDays(local(day), days));
}
