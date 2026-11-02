import type { Day } from "./period";

/** PRD §9.1 statuses. Only PAID / SKIPPED are stored; the rest derive from the date. */
export type BillStatus = "UPCOMING" | "DUE_TODAY" | "OVERDUE" | "PAID" | "SKIPPED";

export function billStatus(state: "PENDING" | "PAID" | "SKIPPED", dueDate: Day, today: Day): BillStatus {
  if (state === "PAID") return "PAID";
  if (state === "SKIPPED") return "SKIPPED";
  if (dueDate < today) return "OVERDUE";
  if (dueDate === today) return "DUE_TODAY";
  return "UPCOMING";
}

/** How far ahead bill occurrences are materialised. */
export const BILL_HORIZON_DAYS = 90;
