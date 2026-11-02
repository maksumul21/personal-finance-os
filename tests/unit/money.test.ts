import { describe, expect, it } from "vitest";
import { parseAmount, percentOf, round2, safeDivide, sum, toMoney, toMoneyString } from "@/domain/money";

describe("money", () => {
  it("adds without floating-point error", () => {
    expect(sum(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(toMoneyString(sum(["1000.10", "2000.20", "-0.30"]))).toBe("3000.00");
  });

  it("accepts Prisma-style Decimal objects via toString", () => {
    expect(toMoney({ toString: () => "123.4500" }).toString()).toBe("123.45");
  });

  it("returns null instead of dividing by zero", () => {
    expect(safeDivide(100, 0)).toBeNull();
    expect(percentOf(5, 0)).toBeNull();
    expect(percentOf(15000, 50000)?.toString()).toBe("30");
  });

  it("rounds half to even", () => {
    expect(round2("2.345").toString()).toBe("2.34");
    expect(round2("2.355").toString()).toBe("2.36");
  });

  it("parses user amounts with grouping and currency symbol", () => {
    expect(parseAmount("1,25,000.50")?.toString()).toBe("125000.5");
    expect(parseAmount("৳ 1200")?.toString()).toBe("1200");
    expect(parseAmount("12.345")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1e5")).toBeNull();
    expect(parseAmount("9999999999999")).toBeNull();
  });
});
