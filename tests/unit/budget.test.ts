import { describe, expect, it } from "vitest";
import {
  budgetLine,
  periodContaining,
  previousPeriod,
  rolloverAmount,
  templateBuckets,
  usageState,
  zeroBased,
} from "@/domain/budget";
import { pickRate, toBase } from "@/domain/fx";
import { toMoney } from "@/domain/money";

describe("budget lines (PRD §6.2)", () => {
  it("computes remaining and usage", () => {
    const l = budgetLine({ allocated: "8000", spent: "6000" });
    expect(l.remaining.toString()).toBe("2000");
    expect(l.usagePct?.toString()).toBe("75");
    expect(l.state).toBe("warning");
  });

  it("applies the default thresholds at their boundaries", () => {
    expect(usageState(toMoney("69.99"), 1)).toBe("normal");
    expect(usageState(toMoney("70"), 1)).toBe("warning");
    expect(usageState(toMoney("89.99"), 1)).toBe("warning");
    expect(usageState(toMoney("90"), 1)).toBe("critical");
    expect(usageState(toMoney("99.99"), 1)).toBe("critical");
    expect(usageState(toMoney("100"), 1)).toBe("overspent");
  });

  it("respects configurable thresholds", () => {
    expect(usageState(toMoney("65"), 1, { warnPct: 60, criticalPct: 80 })).toBe("warning");
  });

  it("treats spending against a zero budget as overspent, and nothing against zero as normal", () => {
    expect(budgetLine({ allocated: "0", spent: "50" }).state).toBe("overspent");
    expect(budgetLine({ allocated: "0", spent: "0" }).state).toBe("normal");
    expect(budgetLine({ allocated: "0", spent: "0" }).usagePct).toBeNull();
  });

  it("adds rollover to what is available", () => {
    const l = budgetLine({ allocated: "3000", spent: "3500", carry: "1000" });
    expect(l.available.toString()).toBe("4000");
    expect(l.remaining.toString()).toBe("500");
    expect(l.state).toBe("warning");
  });
});

describe("rollover (PRD §6.6)", () => {
  it("carries unused budget and ignores overspend unless asked", () => {
    expect(rolloverAmount({ allocated: "5000", spent: "3200" }).toString()).toBe("1800");
    expect(rolloverAmount({ allocated: "5000", spent: "5600" }).toString()).toBe("0");
    expect(rolloverAmount({ allocated: "5000", spent: "5600" }, true).toString()).toBe("-600");
    expect(rolloverAmount({ allocated: "5000", spent: "4000", carry: "500" }).toString()).toBe("1500");
  });
});

describe("zero-based budgeting (PRD §6.4)", () => {
  it("reports unallocated income and completion", () => {
    const plan = ["12000", "8000", "3000", "5000", "4000", "5000", "5000", "8000"];
    const r = zeroBased("50000", plan);
    expect(r.totalAllocated.toString()).toBe("50000");
    expect(r.unallocated.toString()).toBe("0");
    expect(r.status).toBe("complete");
    expect(zeroBased("50000", ["40000"]).status).toBe("unallocated");
    expect(zeroBased("50000", ["60000"]).unallocated.toString()).toBe("-10000");
  });
});

describe("templates (PRD §6.5)", () => {
  it("50/30/20 targets", () => {
    const b = templateBuckets("FIFTY_THIRTY_TWENTY", "50000", { needs: "20000", wants: "15000", living: "35000", savings: "10000", debt: "0" })!;
    expect(b.map((x) => [x.bucket, x.target.toString(), x.difference.toString()])).toEqual([
      ["needs", "25000", "5000"],
      ["wants", "15000", "0"],
      ["savings", "10000", "0"],
    ]);
  });

  it("70/20/10 targets", () => {
    const b = templateBuckets("SEVENTY_TWENTY_TEN", "40000", { needs: 0, wants: 0, living: "28000", savings: "8000", debt: "4000" })!;
    expect(b.map((x) => x.target.toString())).toEqual(["28000", "8000", "4000"]);
    expect(templateBuckets("STANDARD", "1", { needs: 0, wants: 0, living: 0, savings: 0, debt: 0 })).toBeNull();
  });
});

describe("periods", () => {
  it("finds weekly / monthly / annual periods and their predecessors", () => {
    // 2026-11-02 is a Monday; weeks start Saturday by default.
    expect(periodContaining("WEEKLY", "2026-11-02")).toEqual({ start: "2026-10-31", end: "2026-11-06" });
    expect(periodContaining("MONTHLY", "2026-11-02")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(previousPeriod("MONTHLY", { start: "2026-03-01", end: "2026-03-31" })).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousPeriod("ANNUAL", { start: "2026-01-01", end: "2026-12-31" })).toEqual({ start: "2025-01-01", end: "2025-12-31" });
    expect(previousPeriod("CUSTOM", { start: "2026-11-10", end: "2026-11-19" })).toEqual({ start: "2026-10-31", end: "2026-11-09" });
  });
});

describe("exchange rates", () => {
  const rates = [
    { currency: "USD", date: "2026-10-01", rate: "120" },
    { currency: "USD", date: "2026-10-20", rate: "121.5" },
    { currency: "EUR", date: "2026-10-25", rate: "131" },
  ];

  it("uses the latest rate on or before the date and never guesses", () => {
    expect(pickRate(rates, "USD", "2026-10-15")?.toString()).toBe("120");
    expect(pickRate(rates, "USD", "2026-11-01")?.toString()).toBe("121.5");
    expect(pickRate(rates, "USD", "2026-09-30")).toBeNull();
    expect(pickRate(rates, "GBP", "2026-11-01")).toBeNull();
  });

  it("converts only with a rate", () => {
    expect(toBase("100", "USD", "BDT", "121.5")?.toString()).toBe("12150");
    expect(toBase("100", "BDT", "BDT", null)?.toString()).toBe("100");
    expect(toBase("100", "USD", "BDT", null)).toBeNull();
  });
});
