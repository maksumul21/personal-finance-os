import { describe, expect, it } from "vitest";
import { amortizationSchedule, summarize } from "@/domain/loans";
import { extraLoanPayment, goalBySaving, monthlyChange } from "@/domain/what-if";

describe("extra loan payment", () => {
  it("saves months and interest, matching the amortisation schedule", () => {
    // ৳5,00,000 at 12%, EMI ৳23,536.74 (24 months); pay ৳5,000 extra.
    const r = extraLoanPayment("500000", "12", "23536.74", "5000");
    expect(r.base.months).toBe(24);
    const faster = summarize(amortizationSchedule("500000", "12", 600, "28536.74"));
    expect(r.withExtra.months).toBe(faster.months);
    expect(r.withExtra.interest!.equals(faster.totalInterest)).toBe(true);
    expect(r.monthsSaved).toBe(24 - faster.months);
    expect(r.monthsSaved).toBeGreaterThan(0);
    expect(r.interestSaved!.greaterThan(0)).toBe(true);
  });

  it("reports nothing to compare when the EMI never clears the loan", () => {
    const r = extraLoanPayment("1000000", "24", "100", "0");
    expect(r.base.months).toBeNull();
    expect(r.monthsSaved).toBeNull();
  });
});

describe("monthly change on the forecast", () => {
  const base = { today: "2026-11-03", end: "2026-12-31", start: "20000", dailySpend: "0", flows: [{ date: "2026-11-20", amount: "-15000" }] };

  it("adds the amount on the chosen day each month; day 31 clamps to month-end", () => {
    const r = monthlyChange(base, "-8000", 31);
    expect(r.occurrences).toEqual(["2026-11-30", "2026-12-31"]);
    expect(r.base.end.toString()).toBe("5000");
    expect(r.scenario.end.toString()).toBe("-11000");
    expect(r.endDifference.toString()).toBe("-16000");
    expect(r.base.firstNegative).toBeNull();
    expect(r.scenario.firstNegative).toBe("2026-11-30");
    expect(r.scenario.lowestDate).toBe("2026-12-31");
  });

  it("a day already past this month starts next month", () => {
    expect(monthlyChange(base, "1000", 1).occurrences).toEqual(["2026-12-01"]);
  });
});

describe("goal by monthly saving", () => {
  it("counts this month as the first saving month, like the Goals page", () => {
    // ৳1,00,000 left at ৳15,000/month → 7 months (6.67 rounded up): Nov 2026 … May 2027.
    const r = goalBySaving("100000", "15000", "2026-11-03", "2027-04-30")!;
    expect(r.months).toBe(7);
    expect(r.reachedIn).toBe("2027-05");
    expect(r.meetsTarget).toBe(false); // Nov–Apr is 6 saving months
    expect(r.neededForTarget!.toString()).toBe("16666.67"); // 1,00,000 ÷ 6, rounded up
    // Saving exactly the needed amount meets the target.
    expect(goalBySaving("100000", "16666.67", "2026-11-03", "2027-04-30")!.meetsTarget).toBe(true);
  });

  it("handles a reached goal, no target and a zero amount", () => {
    expect(goalBySaving("0", "1000", "2026-11-03", null)).toMatchObject({ months: 0, reachedIn: "2026-11", meetsTarget: null });
    expect(goalBySaving("1000", "300", "2026-11-03", null)).toMatchObject({ months: 4, reachedIn: "2027-02", meetsTarget: null, neededForTarget: null });
    expect(goalBySaving("1000", "0", "2026-11-03", null)).toBeNull();
  });
});
