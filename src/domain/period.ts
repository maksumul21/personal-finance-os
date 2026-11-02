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

/** Last day of the month containing `day`. */
export function endOfMonthDay(day: Day): Day {
  return toDay(endOfMonth(local(day)));
}

/** The `count` months ending with the month of `day`, oldest first, as "yyyy-MM". */
export function monthsEnding(day: Day, count: number): string[] {
  const start = startOfMonth(local(day));
  return Array.from({ length: count }, (_, i) => format(addMonths(start, i - count + 1), "yyyy-MM"));
}

/**
 * A fair comparison for a period that may still be running: the elapsed part of `period`
 * (capped at today) and the same number of days at the start of the preceding period.
 * "1–2 Nov" compares with "1–2 Oct", not with all of October.
 */
export function comparablePeriods(period: Period, today: Day): { current: Period; previous: Period } {
  const end = period.end < today ? period.end : today < period.start ? period.start : today;
  const elapsed = differenceInCalendarDays(local(end), local(period.start));
  const span = daysInPeriod(period);
  // Months: step back by the same number of calendar months; otherwise by the span in days.
  const s = local(period.start);
  const isMonthAligned = s.getDate() === 1 && toDay(endOfMonth(local(period.end))) === period.end;
  let prevStart: Day;
  if (isMonthAligned) {
    const months = (local(period.end).getFullYear() - s.getFullYear()) * 12 + local(period.end).getMonth() - s.getMonth() + 1;
    prevStart = toDay(addMonths(s, -months));
  } else {
    prevStart = addDaysTo(period.start, -span);
  }
  const prevPeriodEnd = addDaysTo(period.start, -1);
  let prevEnd: Day;
  if (end === period.end) {
    // The whole period has elapsed: compare with the whole previous period.
    prevEnd = prevPeriodEnd;
  } else if (isMonthAligned) {
    // Same calendar day, months back (10 Nov → 10 Oct; 31 Mar → 28 Feb).
    const months = (local(period.end).getFullYear() - s.getFullYear()) * 12 + local(period.end).getMonth() - s.getMonth() + 1;
    prevEnd = toDay(addMonths(local(end), -months));
  } else {
    prevEnd = addDaysTo(prevStart, elapsed);
  }
  return {
    current: { start: period.start, end },
    previous: { start: prevStart, end: prevEnd > prevPeriodEnd ? prevPeriodEnd : prevEnd },
  };
}
