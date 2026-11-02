import { describe, expect, it } from "vitest";
import { buildInsights, type InsightInput } from "@/domain/insights";
import { toMoney } from "@/domain/money";
import { comparablePeriods, monthsEnding } from "@/domain/period";

const base: InsightInput = {
  periodLabel: "1–10 Nov",
  previousLabel: "1–10 Oct",
  income: "50000",
  expenses: "20000",
  previousIncome: "50000",
  previousExpenses: "20000",
  categorySpending: [],
  budgetLines: [],
  formatMoney: (v) => `৳${v}`,
};

describe("insights", () => {
  it("reports expense change with its comparison period, and ignores small changes", () => {
    const up = buildInsights({ ...base, expenses: "23600" });
    expect(up.find((i) => i.key === "expense-change")).toMatchObject({
      severity: "warning",
      message: "Your expenses increased by 18% compared with the same days last period.",
      basis: "1–10 Nov vs 1–10 Oct",
    });
    expect(buildInsights({ ...base, expenses: "21000" }).some((i) => i.key === "expense-change")).toBe(false);
  });

  it("does not compare against a tiny previous period", () => {
    expect(buildInsights({ ...base, previousExpenses: "200", expenses: "5000" }).some((i) => i.key === "expense-change")).toBe(false);
  });

  it("warns when spending exceeds income and orders critical first", () => {
    const r = buildInsights({ ...base, income: "10000", expenses: "12500" });
    expect(r[0]).toMatchObject({ key: "spending-exceeds-income", severity: "critical" });
    expect(r[0].message).toBe("You've spent ৳2500.00 more than you earned.");
  });

  it("names the top category as a share of income (PRD example: food 32%)", () => {
    const r = buildInsights({ ...base, categorySpending: [{ name: "Food", amount: "16000" }, { name: "Transport", amount: "3000" }] });
    expect(r.find((i) => i.key === "top-category:Food")?.message).toBe("Food is your largest expense: 32% of your income.");
  });

  it("reports budget warnings and savings-rate changes in percentage points", () => {
    const r = buildInsights({
      ...base,
      expenses: "17500",
      budgetLines: [{ name: "Shopping", usagePct: toMoney("85"), state: "warning" }],
    });
    expect(r.find((i) => i.key === "budget:Shopping")?.message).toBe("You've used 85% of your Shopping budget.");
    expect(r.find((i) => i.key === "savings-rate-change")?.message).toBe("Your savings rate improved by 5 percentage points, to 65%.");
  });

  it("produces nothing without data", () => {
    expect(buildInsights({ ...base, income: "0", expenses: "0", previousIncome: "0", previousExpenses: "0" })).toEqual([]);
  });
});

describe("comparable periods", () => {
  it("compares month-to-date with the same days of the previous month", () => {
    expect(comparablePeriods({ start: "2026-11-01", end: "2026-11-30" }, "2026-11-10")).toEqual({
      current: { start: "2026-11-01", end: "2026-11-10" },
      previous: { start: "2026-10-01", end: "2026-10-10" },
    });
  });

  it("caps at the end of a shorter previous month and handles finished periods", () => {
    expect(comparablePeriods({ start: "2026-03-01", end: "2026-03-31" }, "2026-03-31").previous).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(comparablePeriods({ start: "2026-10-01", end: "2026-10-31" }, "2026-11-10")).toEqual({
      current: { start: "2026-10-01", end: "2026-10-31" },
      previous: { start: "2026-09-01", end: "2026-09-30" },
    });
    expect(comparablePeriods({ start: "2026-09-01", end: "2026-11-30" }, "2026-11-30").previous).toEqual({ start: "2026-06-01", end: "2026-08-31" });
  });

  it("lists trailing months", () => {
    expect(monthsEnding("2026-02-15", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("insights: bills and emergency fund", () => {
  it("flags overdue bills as critical and summarises the week ahead (PRD §4.5 example)", () => {
    const r = buildInsights({ ...base, bills: { overdueCount: 2, dueSoonCount: 3, dueSoonTotal: "8500" } });
    expect(r[0]).toMatchObject({ key: "bills-overdue", severity: "critical", message: "2 bills are overdue." });
    expect(r.find((i) => i.key === "bills-due-soon")?.message).toBe("You have 3 upcoming bills totaling ৳8500.");
  });

  it("warns when the emergency fund is below target, and stays quiet once reached", () => {
    const below = buildInsights({ ...base, emergencyFund: { saved: "60000", target: "180000", monthsCovered: "2.0", targetMonths: 6 } });
    expect(below.find((i) => i.key === "emergency-fund-below-target")?.message).toBe("Your emergency fund covers 2.0 of 6 target months.");
    const met = buildInsights({ ...base, emergencyFund: { saved: "180000", target: "180000", monthsCovered: "6.0", targetMonths: 6 } });
    expect(met.some((i) => i.key === "emergency-fund-below-target")).toBe(false);
  });
});
