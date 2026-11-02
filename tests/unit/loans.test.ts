import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { amortizationSchedule, emi, payoffPlan, splitPayment, summarize } from "@/domain/loans";
import { sum, toMoney } from "@/domain/money";

describe("EMI", () => {
  it("matches the standard formula: ৳10,00,000 at 9% for 60 months = ৳20,758.36", () => {
    expect(emi("1000000", "9", 60).toFixed(2)).toBe("20758.36");
  });

  it("divides evenly at a zero rate and rejects bad inputs", () => {
    expect(emi("120000", "0", 12).toFixed(2)).toBe("10000.00");
    expect(() => emi("0", "9", 12)).toThrow();
    expect(() => emi("1000", "-1", 12)).toThrow();
    expect(() => emi("1000", "9", 0)).toThrow();
    expect(() => emi("1000", "9", 1.5)).toThrow();
  });
});

describe("payment split (D-002: principal is a transfer, interest an expense)", () => {
  it("charges the month's interest first and the rest reduces principal", () => {
    const s = splitPayment("1000000", "9", "20758.36");
    expect(s.interest.toFixed(2)).toBe("7500.00");
    expect(s.principal.toFixed(2)).toBe("13258.36");
    expect(s.balance.toFixed(2)).toBe("986741.64");
  });

  it("never takes more principal than is owed, and refuses a payment below the interest", () => {
    const s = splitPayment("1000", "12", "5000");
    expect(s.interest.toFixed(2)).toBe("10.00");
    expect(s.principal.toFixed(2)).toBe("1000.00");
    expect(s.balance.isZero()).toBe(true);
    expect(() => splitPayment("1000000", "12", "9999.99")).toThrow(/interest/);
  });
});

describe("amortisation schedule", () => {
  it("pays the loan off exactly in the term; principal parts sum to the principal", () => {
    const rows = amortizationSchedule("1000000", "9", 60);
    expect(rows).toHaveLength(60);
    expect(rows.at(-1)!.balance.isZero()).toBe(true);
    expect(sum(rows.map((r) => r.principal)).toFixed(2)).toBe("1000000.00");
    const s = summarize(rows);
    expect(s.totalPaid.minus(s.totalInterest).toFixed(2)).toBe("1000000.00");
    // All but the last instalment are the EMI.
    expect(rows.slice(0, -1).every((r) => r.payment.toFixed(2) === "20758.36")).toBe(true);
  });

  it("a larger payment finishes early and costs less interest", () => {
    const base = summarize(amortizationSchedule("500000", "12", 36));
    const faster = summarize(amortizationSchedule("500000", "12", 36, "25000"));
    expect(faster.months).toBeLessThan(base.months);
    expect(faster.totalInterest.lessThan(base.totalInterest)).toBe(true);
  });

  it("property: any loan amortises to exactly zero with non-increasing balances", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 1_000_000_000 }).map((c) => (c / 100).toFixed(2)),
        fc.integer({ min: 0, max: 3000 }).map((bp) => (bp / 100).toString()),
        fc.integer({ min: 1, max: 360 }),
        (principal, rate, months) => {
          const rows = amortizationSchedule(principal, rate, months);
          // EMI is rounded to paisa, so a tiny loan over a long term can finish a little early.
          expect(rows.length).toBeLessThanOrEqual(months);
          expect(rows.at(-1)!.balance.isZero()).toBe(true);
          expect(sum(rows.map((r) => r.principal)).equals(toMoney(principal))).toBe(true);
          for (let i = 1; i < rows.length; i++) expect(rows[i].balance.lessThanOrEqualTo(rows[i - 1].balance)).toBe(true);
          for (const r of rows) expect(r.principal.isNegative() || r.interest.isNegative()).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("payoff strategies", () => {
  const debts = [
    { id: "card", balance: "50000", annualRatePct: "36", minPayment: "2500" },
    { id: "personal", balance: "200000", annualRatePct: "14", minPayment: "6000" },
    { id: "small", balance: "8000", annualRatePct: "10", minPayment: "500" },
  ];

  it("snowball clears the smallest balance first; avalanche the highest rate first", () => {
    expect(payoffPlan(debts, "5000", "SNOWBALL").order[0]).toBe("small");
    expect(payoffPlan(debts, "5000", "AVALANCHE").order[0]).toBe("card");
  });

  it("avalanche never costs more interest than snowball; extra money shortens payoff", () => {
    const snow = payoffPlan(debts, "5000", "SNOWBALL");
    const aval = payoffPlan(debts, "5000", "AVALANCHE");
    expect(aval.totalInterest.lessThanOrEqualTo(snow.totalInterest)).toBe(true);
    const minimumsOnly = payoffPlan(debts, "0", "AVALANCHE");
    expect(aval.months!).toBeLessThan(minimumsOnly.months!);
    expect(Object.keys(aval.clearedInMonth).sort()).toEqual(["card", "personal", "small"]);
  });

  it("reports null months when payments can't outrun the interest", () => {
    const r = payoffPlan([{ id: "x", balance: "1000000", annualRatePct: "24", minPayment: "100" }], "0", "AVALANCHE");
    expect(r.months).toBeNull();
  });
});
