import { describe, expect, it } from "vitest";
import { projectBalances, typicalDailySpend } from "@/domain/forecast";

describe("cash-flow forecast", () => {
  it("applies flows on their day, overdue ones today, and day-to-day spend from tomorrow", () => {
    const f = projectBalances({
      today: "2026-11-03",
      end: "2026-11-07",
      start: "10000",
      dailySpend: "500",
      flows: [
        { date: "2026-10-28", amount: "-1500" }, // overdue bill → today
        { date: "2026-11-05", amount: "-12000" },
        { date: "2026-11-06", amount: "30000" },
        { date: "2026-12-01", amount: "-99999" }, // past the horizon
      ],
    });
    expect(f.points.map((p) => `${p.date} ${p.balance.toString()}`)).toEqual([
      "2026-11-03 8500",
      "2026-11-04 8000",
      "2026-11-05 -4500",
      "2026-11-06 25000",
      "2026-11-07 24500",
    ]);
    expect(f.firstNegative).toBe("2026-11-05");
    expect(f.lowest).toMatchObject({ date: "2026-11-05" });
    expect(f.lowest.balance.toString()).toBe("-4500");
    expect(f.endBalance.toString()).toBe("24500");
    expect(f.scheduledIn.toString()).toBe("30000");
    expect(f.scheduledOut.toString()).toBe("13500");
    expect(f.dayToDay.toString()).toBe("2000");
  });

  it("without day-to-day spend, a balance with no flows stays flat", () => {
    const f = projectBalances({ today: "2026-11-03", end: "2026-11-05", start: "100", dailySpend: "0", flows: [] });
    expect(f.points.map((p) => p.balance.toString())).toEqual(["100", "100", "100"]);
    expect(f.firstNegative).toBeNull();
    expect(f.lowest.date).toBe("2026-11-03");
  });

  it("typical daily spend is the period average to 2 dp", () => {
    expect(typicalDailySpend("10000", 90).toString()).toBe("111.11");
    expect(typicalDailySpend("0", 90).isZero()).toBe(true);
    expect(typicalDailySpend("100", 0).isZero()).toBe(true);
  });
});
