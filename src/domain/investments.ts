import { ZERO, round2, sum, toMoney, type Money, type MoneyInput } from "./money";
import type { Day } from "./period";

/**
 * Investment holdings (ROADMAP Phase 4). Pure, exact decimals, no I/O.
 *
 * - Trades use average cost: a sale removes cost in proportion to the units sold.
 * - Prices come only from what the user records (latest on or before the date); an unpriced
 *   holding is valued at cost and flagged, never guessed.
 * - Market moves are not income or expenses. The INVESTMENT account's ledger balance stays the
 *   money put in; its value = ledger balance + realised gains + unrealised gains (D-029).
 */

export type TradeSide = "BUY" | "SELL";

export interface Trade {
  side: TradeSide;
  date: Day;
  /** Units bought or sold (> 0). */
  units: MoneyInput;
  /** BUY: total paid incl. fees. SELL: proceeds after fees. */
  amount: MoneyInput;
}

export interface PricePoint {
  date: Day;
  price: MoneyInput;
}

export class TradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeError";
  }
}

export interface Position {
  units: Money;
  /** Cost of the units still held. */
  cost: Money;
  /** Gains (or losses, negative) locked in by sales. */
  realized: Money;
}

/** Replays trades up to `asOf` (inclusive) in order. Throws when a sale exceeds the units held. */
export function position(trades: Trade[], asOf: Day = "9999-12-31"): Position {
  let units = ZERO;
  let cost = ZERO;
  let realized = ZERO;
  for (const t of trades) {
    if (t.date > asOf) continue;
    const u = toMoney(t.units);
    const amount = toMoney(t.amount);
    if (!u.greaterThan(0)) throw new TradeError("Units must be greater than zero");
    if (amount.isNegative()) throw new TradeError("Amount can't be negative");
    if (t.side === "BUY") {
      units = units.plus(u);
      cost = cost.plus(amount);
    } else {
      if (u.greaterThan(units)) throw new TradeError(`Can't sell ${u.toString()} units on ${t.date}: only ${units.toString()} held`);
      // Selling everything removes all remaining cost, so rounding never leaves a residue.
      const costOut = u.equals(units) ? cost : round2(cost.times(u).div(units));
      units = units.minus(u);
      cost = cost.minus(costOut);
      realized = realized.plus(amount.minus(costOut));
    }
  }
  return { units, cost, realized };
}

/** Trades sorted the way `position` must read them: by date, keeping entry order within a day. */
export function sortTrades<T extends Trade>(trades: T[]): T[] {
  return trades.map((t, i) => ({ t, i })).sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.i - b.i)).map((x) => x.t);
}

/** The latest recorded price on or before `onOrBefore`, or null. */
export function priceOn(prices: PricePoint[], onOrBefore: Day): { price: Money; date: Day } | null {
  let best: PricePoint | null = null;
  for (const p of prices) if (p.date <= onOrBefore && (!best || p.date > best.date)) best = p;
  return best ? { price: toMoney(best.price), date: best.date } : null;
}

export interface Valuation extends Position {
  /** units × price, or cost when no price is recorded. */
  marketValue: Money;
  unrealized: Money;
  price: Money | null;
  priceDate: Day | null;
  /** Average cost per unit; null when nothing is held. */
  averageCost: Money | null;
}

export function valueHolding(trades: Trade[], prices: PricePoint[], asOf: Day = "9999-12-31"): Valuation {
  const p = position(sortTrades(trades), asOf);
  const quote = priceOn(prices, asOf);
  const marketValue = quote ? round2(p.units.times(quote.price)) : p.cost;
  return {
    ...p,
    marketValue,
    unrealized: marketValue.minus(p.cost),
    price: quote?.price ?? null,
    priceDate: quote?.date ?? null,
    averageCost: p.units.greaterThan(0) ? p.cost.div(p.units) : null,
  };
}

/**
 * How far an INVESTMENT account's value differs from its ledger balance: realised + unrealised
 * gains across its holdings. Value = ledger balance + adjustment.
 */
export function valuationAdjustment(holdings: { trades: Trade[]; prices: PricePoint[] }[], asOf: Day = "9999-12-31"): Money {
  return sum(
    holdings.map((h) => {
      const v = valueHolding(h.trades, h.prices, asOf);
      return v.realized.plus(v.unrealized);
    }),
  );
}

/**
 * Cash not invested in any holding: ledger balance + realised gains − cost of open positions.
 * A buy must not take this below zero (money has to be moved into the account first).
 */
export function uninvestedCash(ledgerBalance: MoneyInput, holdings: { trades: Trade[] }[], asOf: Day = "9999-12-31"): Money {
  let cash = toMoney(ledgerBalance);
  for (const h of holdings) {
    const p = position(sortTrades(h.trades), asOf);
    cash = cash.plus(p.realized).minus(p.cost);
  }
  return cash;
}

/** Return on cost in percent; null when nothing is invested. */
export function returnPct(gain: MoneyInput, cost: MoneyInput): Money | null {
  const c = toMoney(cost);
  return c.isZero() ? null : toMoney(gain).div(c).times(100);
}
