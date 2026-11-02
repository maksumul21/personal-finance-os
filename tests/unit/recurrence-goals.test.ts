import { describe, expect, it } from "vitest";
import { billStatus } from "@/domain/bills";
import { emergencyTarget, goalProgress, monthsCovered, monthsUntil, savedAmount } from "@/domain/goals";
import {
  annualEquivalent,
  describeSchedule,
  monthlyEquivalent,
  nextAfter,
  nextOnOrAfter,
  occurrencesBetween,
} from "@/domain/recurrence";

describe("recurrence engine", () => {
  it("keeps month-end anchors instead of drifting", () => {
    const s = { start: "2026-01-31", unit: "MONTHLY" as const, interval: 1 };
    expect(occurrencesBetween(s, "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("handles weekly, quarterly, yearly (leap day) and daily schedules", () => {
    expect(occurrencesBetween({ start: "2026-11-02", unit: "WEEKLY", interval: 2 }, "2026-11-01", "2026-12-01")).toEqual([
      "2026-11-02",
      "2026-11-16",
      "2026-11-30",
    ]);
    expect(occurrencesBetween({ start: "2026-01-15", unit: "MONTHLY", interval: 3 }, "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
    expect(occurrencesBetween({ start: "2028-02-29", unit: "YEARLY", interval: 1 }, "2028-01-01", "2030-12-31")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
    ]);
    expect(occurrencesBetween({ start: "2026-11-30", unit: "DAILY", interval: 1 }, "2026-11-30", "2026-12-02")).toHaveLength(3);
  });

  it("respects end dates and one-off schedules", () => {
    const s = { start: "2026-01-10", unit: "MONTHLY" as const, interval: 1, end: "2026-03-10" };
    expect(occurrencesBetween(s, "2026-01-01", "2026-12-31")).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(nextOnOrAfter(s, "2026-03-11")).toBeNull();
    expect(occurrencesBetween({ start: "2026-05-05", unit: null, interval: 1 }, "2026-01-01", "2026-12-31")).toEqual(["2026-05-05"]);
    expect(nextAfter({ start: "2026-05-05", unit: null, interval: 1 }, "2026-05-05")).toBeNull();
  });

  it("finds the next occurrence", () => {
    const s = { start: "2026-01-31", unit: "MONTHLY" as const, interval: 1 };
    expect(nextOnOrAfter(s, "2026-02-01")).toBe("2026-02-28");
    expect(nextOnOrAfter(s, "2026-02-28")).toBe("2026-02-28");
    expect(nextAfter(s, "2026-02-28")).toBe("2026-03-31");
  });

  it("describes schedules and normalises subscription costs", () => {
    expect(describeSchedule("MONTHLY", 3)).toBe("Quarterly");
    expect(describeSchedule("WEEKLY", 2)).toBe("Every 2 weeks");
    expect(describeSchedule(null, 1)).toBe("Once");
    expect(monthlyEquivalent("1200", "YEARLY", 1).toString()).toBe("100");
    expect(monthlyEquivalent("300", "MONTHLY", 3).toString()).toBe("100");
    expect(monthlyEquivalent("120", "WEEKLY", 1).toString()).toBe("520");
    expect(annualEquivalent("199", "MONTHLY", 1).toString()).toBe("2388");
  });
});

describe("goals", () => {
  it("PRD §8.2 progress, remaining and required monthly contribution", () => {
    const saved = savedAmount([
      { direction: "DEPOSIT", amount: "20000" },
      { direction: "DEPOSIT", amount: "15000" },
      { direction: "WITHDRAWAL", amount: "5000" },
    ]);
    expect(saved.toString()).toBe("30000");
    const p = goalProgress({ target: "120000", saved, targetDate: "2027-10-31", createdOn: "2026-05-01", today: "2026-11-02" });
    expect(p.remaining.toString()).toBe("90000");
    expect(p.progressPct.toString()).toBe("25");
    expect(p.monthsLeft).toBe(12);
    expect(p.requiredMonthly?.toString()).toBe("7500");
    expect(p.pace).toBe("behind"); // ~33% of the time elapsed, 25% saved
  });

  it("achieved, overdue and undated goals", () => {
    expect(goalProgress({ target: "100", saved: "120", targetDate: "2027-01-01", createdOn: "2026-01-01", today: "2026-11-02" })).toMatchObject({
      pace: "achieved",
    });
    expect(goalProgress({ target: "100", saved: "120", targetDate: null, createdOn: "2026-01-01", today: "2026-11-02" }).remaining.toString()).toBe("0");
    expect(goalProgress({ target: "100", saved: "20", targetDate: "2026-10-01", createdOn: "2026-01-01", today: "2026-11-02" }).pace).toBe("overdue");
    expect(goalProgress({ target: "100", saved: "20", targetDate: null, createdOn: "2026-01-01", today: "2026-11-02" }).requiredMonthly).toBeNull();
  });

  it("required monthly rounds up so the goal is actually reached", () => {
    const p = goalProgress({ target: "1000", saved: "0", targetDate: "2027-01-15", createdOn: "2026-11-02", today: "2026-11-02" });
    expect(p.monthsLeft).toBe(3);
    expect(p.requiredMonthly?.toString()).toBe("333.34");
    expect(monthsUntil("2026-11-02", "2026-11-30")).toBe(1);
  });

  it("PRD §8.4 emergency fund target and coverage", () => {
    expect(emergencyTarget("30000", 6).toString()).toBe("180000");
    expect(monthsCovered("75000", "30000")?.toString()).toBe("2.5");
    expect(monthsCovered("75000", "0")).toBeNull();
  });
});

describe("bill status (PRD §9.1)", () => {
  it("derives upcoming / due today / overdue / paid", () => {
    expect(billStatus("PENDING", "2026-11-05", "2026-11-02")).toBe("UPCOMING");
    expect(billStatus("PENDING", "2026-11-02", "2026-11-02")).toBe("DUE_TODAY");
    expect(billStatus("PENDING", "2026-11-01", "2026-11-02")).toBe("OVERDUE");
    expect(billStatus("PAID", "2026-11-01", "2026-11-02")).toBe("PAID");
  });
});
