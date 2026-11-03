import { describe, expect, it } from "vitest";
import { safeToSpend, windowEnd } from "@/domain/safe-to-spend";

const base = {
  today: "2026-11-03",
  monthEnd: "2026-11-30",
  balances: ["50000", "10000"],
  commitments: [],
  goals: [],
};

describe("safe-to-spend window", () => {
  it("runs to the day before next income, else month-end", () => {
    expect(windowEnd("2026-11-03", "2026-11-30", "2026-11-25")).toBe("2026-11-24");
    expect(windowEnd("2026-11-03", "2026-11-30", null)).toBe("2026-11-30");
    // Income today doesn't shrink the window to nothing.
    expect(windowEnd("2026-11-03", "2026-11-30", "2026-11-03")).toBe("2026-11-30");
  });
});

describe("safe-to-spend", () => {
  it("subtracts commitments due in the window and goal savings still needed", () => {
    const r = safeToSpend({
      ...base,
      nextIncome: "2026-11-25",
      commitments: [
        { kind: "BILL", title: "Internet", date: "2026-11-10", amount: "1500" },
        { kind: "BILL", title: "Old bill", date: "2026-10-28", amount: "500" }, // overdue: still counts
        { kind: "EMI", title: "Car loan", date: "2026-11-05", amount: "23536.74" },
        { kind: "RECURRING", title: "Rent", date: "2026-12-01", amount: "20000" }, // after the window
      ],
      goals: [
        { title: "Laptop", requiredMonthly: "10000", savedThisMonth: "4000" },
        { title: "Trip", requiredMonthly: "3000", savedThisMonth: "5000" }, // already ahead
      ],
    });
    expect(r.windowEnd).toBe("2026-11-24");
    expect(r.daysLeft).toBe(22);
    expect(r.available.toString()).toBe("60000");
    expect(r.committed.toFixed(2)).toBe("25536.74");
    expect(r.commitments.map((c) => c.title)).toEqual(["Old bill", "Car loan", "Internet"]);
    expect(r.goalSetAside.toString()).toBe("6000");
    expect(r.safe.toFixed(2)).toBe("28463.26");
    // 28,463.26 / 22 = 1,293.7845… → rounded down so it never overstates.
    expect(r.perDay!.toFixed(2)).toBe("1293.78");
  });

  it("reports a shortfall without a per-day figure", () => {
    const r = safeToSpend({ ...base, nextIncome: null, commitments: [{ kind: "BILL", title: "Rent", date: "2026-11-05", amount: "75000" }] });
    expect(r.safe.toString()).toBe("-15000");
    expect(r.perDay).toBeNull();
    expect(r.daysLeft).toBe(28);
  });
});
