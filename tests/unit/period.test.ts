import { describe, expect, it } from "vitest";
import { daysInPeriod, dayToDb, dbToDay, isDay, monthOf, resolvePreset, todayIn } from "@/domain/period";

describe("period", () => {
  it("resolves today in the user's timezone, not UTC", () => {
    // 2026-03-31 20:30 UTC is already 1 April in Dhaka (UTC+6).
    const instant = new Date("2026-03-31T20:30:00Z");
    expect(todayIn("Asia/Dhaka", instant)).toBe("2026-04-01");
    expect(todayIn("UTC", instant)).toBe("2026-03-31");
    expect(todayIn("America/New_York", instant)).toBe("2026-03-31");
  });

  it("handles month boundaries and leap years", () => {
    expect(monthOf("2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(monthOf("2026-01-31", -1)).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(monthOf("2026-03-31", -1)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("resolves presets", () => {
    expect(resolvePreset("LAST_3_MONTHS", "2026-11-02")).toEqual({ start: "2026-09-01", end: "2026-11-30" });
    expect(resolvePreset("LAST_YEAR", "2026-11-02")).toEqual({ start: "2025-01-01", end: "2025-12-31" });
    expect(daysInPeriod(monthOf("2026-02-15"))).toBe(28);
  });

  it("round-trips DB dates without shifting", () => {
    expect(dbToDay(dayToDb("2026-12-31"))).toBe("2026-12-31");
  });

  it("validates day strings", () => {
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-1-01")).toBe(false);
  });
});
