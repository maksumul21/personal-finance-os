import { describe, expect, it } from "vitest";
import { emiDueDates, monthGrid, monthTotals, shiftMonth, type CalendarEvent } from "@/domain/calendar";

describe("calendar grid", () => {
  it("pads to whole weeks from the user's week start", () => {
    const g = monthGrid("2026-11", 6); // Saturday start
    expect(g.length % 7).toBe(0);
    expect(g[0]).toEqual({ date: "2026-10-31", inMonth: false });
    expect(g.filter((d) => d.inMonth)).toHaveLength(30);
    expect(monthGrid("2026-11", 1)[0].date).toBe("2026-10-26"); // Monday start
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("EMI dates", () => {
  it("keeps the month-end anchor and stops at payoff", () => {
    // First instalment 31 Jan; next due 31 Mar; 3 left.
    expect(emiDueDates("2026-01-31", "2026-03-31", 3, "2026-01-01", "2026-12-31")).toEqual(["2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(emiDueDates("2026-01-31", "2026-03-31", 3, "2026-04-01", "2026-04-30")).toEqual(["2026-04-30"]);
  });
});

describe("month totals", () => {
  const e = (over: Partial<CalendarEvent>): CalendarEvent => ({
    id: Math.random().toString(),
    date: "2026-11-10",
    kind: "BILL",
    title: "x",
    amount: "100",
    currency: "BDT",
    direction: "OUT",
    status: "DUE",
    href: "/",
    ...over,
  });

  it("expects only open base-currency items; done, skipped and foreign ones don't count", () => {
    const t = monthTotals(
      [
        e({ amount: "1500" }),
        e({ amount: "500", status: "OVERDUE" }),
        e({ amount: "999", status: "DONE" }),
        e({ amount: "999", status: "SKIPPED" }),
        e({ amount: "999", currency: "USD" }),
        e({ kind: "RECURRING", direction: "IN", amount: "80000", status: "PROJECTED" }),
        e({ kind: "RECURRING", direction: "MOVE", amount: "5000", status: "PROJECTED" }),
        e({ kind: "GOAL", direction: null, status: "TARGET" }),
      ],
      "BDT",
      { income: "0", expenses: "250" },
    );
    expect(t.expectedOut.toString()).toBe("2000");
    expect(t.expectedIn.toString()).toBe("80000");
    expect(t.actualOut.toString()).toBe("250");
    expect(t.overdueCount).toBe(1);
  });
});
