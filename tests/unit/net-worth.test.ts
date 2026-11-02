import { describe, expect, it } from "vitest";
import { manualContribution, netWorthChange, valueOn } from "@/domain/net-worth";

describe("manual items", () => {
  const flat = { kind: "ASSET" as const, valuations: [{ date: "2026-01-15", value: "5000000" }, { date: "2026-07-01", value: "5400000" }] };
  const debt = { kind: "LIABILITY" as const, valuations: [{ date: "2026-03-01", value: "200000" }, { date: "2026-09-01", value: "0" }] };

  it("uses the latest valuation on or before the date; zero before the first one", () => {
    expect(valueOn(flat.valuations, "2026-06-30")?.value.toString()).toBe("5000000");
    expect(valueOn(flat.valuations, "2026-07-01")?.date).toBe("2026-07-01");
    expect(valueOn(flat.valuations, "2026-01-01")).toBeNull();
    expect(manualContribution(flat, "2026-01-01").isZero()).toBe(true);
  });

  it("assets add, liabilities subtract; a zero valuation means settled", () => {
    expect(manualContribution(flat, "2026-08-01").toString()).toBe("5400000");
    expect(manualContribution(debt, "2026-05-01").toString()).toBe("-200000");
    expect(manualContribution(debt, "2026-10-01").isZero()).toBe(true);
  });

  it("change is measured against the absolute earlier value; null % from zero", () => {
    const up = netWorthChange("110000", "100000");
    expect(up.amount.toString()).toBe("10000");
    expect(up.pct!.toString()).toBe("10");
    // From −100,000 to −50,000 is an improvement: +50%.
    expect(netWorthChange("-50000", "-100000").pct!.toString()).toBe("50");
    expect(netWorthChange("1", "0").pct).toBeNull();
  });
});
