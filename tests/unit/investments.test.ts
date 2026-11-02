import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { position, priceOn, returnPct, sortTrades, uninvestedCash, valuationAdjustment, valueHolding, type Trade } from "@/domain/investments";

const buy = (date: string, units: string, amount: string): Trade => ({ side: "BUY", date, units, amount });
const sell = (date: string, units: string, amount: string): Trade => ({ side: "SELL", date, units, amount });

describe("average-cost positions", () => {
  it("removes cost in proportion to units sold and books the realised gain", () => {
    // 100 @ 50 + 100 @ 70 → avg 60. Sell 50 for 4,000 → cost out 3,000, gain 1,000.
    const p = position([buy("2026-01-10", "100", "5000"), buy("2026-02-10", "100", "7000"), sell("2026-03-10", "50", "4000")]);
    expect(p.units.toString()).toBe("150");
    expect(p.cost.toFixed(2)).toBe("9000.00");
    expect(p.realized.toFixed(2)).toBe("1000.00");
  });

  it("selling everything clears all cost; losses are negative; overselling is refused", () => {
    const p = position([buy("2026-01-01", "3", "100"), sell("2026-02-01", "1", "20"), sell("2026-03-01", "2", "50")]);
    expect(p.units.isZero()).toBe(true);
    expect(p.cost.isZero()).toBe(true);
    expect(p.realized.toFixed(2)).toBe("-30.00");
    expect(() => position([buy("2026-01-01", "1", "10"), sell("2026-01-02", "2", "30")])).toThrow(/only 1 held/);
  });

  it("respects the as-of date and sorts trades by date", () => {
    const trades = sortTrades([sell("2026-03-01", "5", "600"), buy("2026-01-01", "10", "1000")]);
    expect(trades[0].side).toBe("BUY");
    expect(position(trades, "2026-02-01").units.toString()).toBe("10");
    expect(position(trades).units.toString()).toBe("5");
  });
});

describe("valuation", () => {
  const trades = [buy("2026-01-10", "100", "5000")];

  it("uses the latest recorded price on or before the date; unpriced holdings stay at cost", () => {
    const prices = [{ date: "2026-01-31", price: "55" }, { date: "2026-02-28", price: "48.5" }];
    expect(priceOn(prices, "2026-02-15")?.price.toString()).toBe("55");
    const v = valueHolding(trades, prices, "2026-03-15");
    expect(v.marketValue.toFixed(2)).toBe("4850.00");
    expect(v.unrealized.toFixed(2)).toBe("-150.00");
    expect(v.priceDate).toBe("2026-02-28");
    expect(v.averageCost!.toString()).toBe("50");

    const unpriced = valueHolding(trades, [], "2026-03-15");
    expect(unpriced.price).toBeNull();
    expect(unpriced.marketValue.toFixed(2)).toBe("5000.00");
    expect(unpriced.unrealized.isZero()).toBe(true);
  });

  it("account value = ledger + realised + unrealised; cash excludes money in holdings", () => {
    // ৳20,000 moved in; bought 100 for 5,000; sold 40 for 2,400 (cost 2,000 → +400); price now 60.
    const holding = { trades: [buy("2026-01-10", "100", "5000"), sell("2026-02-10", "40", "2400")], prices: [{ date: "2026-03-01", price: "60" }] };
    const adj = valuationAdjustment([holding]);
    expect(adj.toFixed(2)).toBe("1000.00"); // realised 400 + unrealised (3,600 − 3,000)
    expect(uninvestedCash("20000", [holding]).toFixed(2)).toBe("17400.00"); // 20,000 − 5,000 + 2,400
    // Value 21,000 = cash 17,400 + holding 3,600.
    expect(adj.plus(20000).toFixed(2)).toBe("21000.00");
  });

  it("property: cash + market value always equals ledger + adjustment", () => {
    const tradeArb = fc.record({
      units: fc.integer({ min: 1, max: 1000 }),
      cents: fc.integer({ min: 1, max: 10_000_000 }),
      sellFraction: fc.integer({ min: 0, max: 100 }),
    });
    fc.assert(
      fc.property(fc.array(tradeArb, { minLength: 1, maxLength: 8 }), fc.integer({ min: 1, max: 100_000 }), (rows, priceCents) => {
        const trades: Trade[] = [];
        let held = 0;
        rows.forEach((r, i) => {
          const date = `2026-01-${String(i + 1).padStart(2, "0")}`;
          trades.push(buy(date, String(r.units), (r.cents / 100).toFixed(2)));
          held += r.units;
          const s = Math.floor((held * r.sellFraction) / 100);
          if (s > 0) {
            trades.push(sell(date, String(s), (r.cents / 200).toFixed(2)));
            held -= s;
          }
        });
        const holding = { trades, prices: [{ date: "2026-01-01", price: (priceCents / 100).toFixed(2) }] };
        const v = valueHolding(holding.trades, holding.prices);
        expect(v.units.toNumber()).toBe(held);
        expect(v.cost.isNegative()).toBe(false);
        const ledger = "1000000";
        const lhs = uninvestedCash(ledger, [holding]).plus(v.marketValue);
        const rhs = valuationAdjustment([holding]).plus(ledger);
        expect(lhs.equals(rhs)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("return % is null without cost", () => {
    expect(returnPct("500", "5000")!.toString()).toBe("10");
    expect(returnPct("0", "0")).toBeNull();
  });
});
