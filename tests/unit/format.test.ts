import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent } from "@/lib/format";

describe("formatMoney", () => {
  it("uses lakh grouping by default and international on request", () => {
    expect(formatMoney("1250000.5", "BDT")).toBe("৳12,50,000.50");
    expect(formatMoney("1250000.5", "BDT", { pref: "INTL" })).toBe("৳1,250,000.50");
  });

  it("formats signs with a true minus and optional plus", () => {
    expect(formatMoney("-8500", "BDT")).toBe("−৳8,500.00");
    expect(formatMoney("8500", "BDT", { signed: true })).toBe("+৳8,500.00");
    expect(formatMoney("0", "BDT", { signed: true })).toBe("৳0.00");
  });

  it("keeps precision for large decimal strings (no float conversion)", () => {
    expect(formatMoney("999999999999.99", "USD", { pref: "INTL" })).toBe("$999,999,999,999.99");
  });

  it("drops decimals only for whole values when compact", () => {
    expect(formatMoney("15000.00", "BDT", { compactDecimals: true })).toBe("৳15,000");
    expect(formatMoney("15000.25", "BDT", { compactDecimals: true })).toBe("৳15,000.25");
  });

  it("shows N/A for undefined percentages", () => {
    expect(formatPercent(null)).toBe("N/A");
    expect(formatPercent("30")).toBe("30.0%");
  });
});
