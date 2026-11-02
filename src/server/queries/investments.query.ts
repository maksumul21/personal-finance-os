import "server-only";
import { returnPct, uninvestedCash, valueHolding } from "@/domain/investments";
import { ZERO, sum, toMoney, toMoneyString, type Money } from "@/domain/money";
import type { Day } from "@/domain/period";
import { getAccountsOverview } from "./accounts.query";
import { loadHoldings } from "./holdings.data";

export interface TradeDTO {
  id: string;
  side: "BUY" | "SELL";
  date: Day;
  units: string;
  amount: string;
  notes: string | null;
}

export interface HoldingDTO {
  id: string;
  accountId: string;
  name: string;
  symbol: string | null;
  assetClass: string;
  notes: string | null;
  units: string;
  /** Cost of the units still held. */
  cost: string;
  averageCost: string | null;
  price: string | null;
  priceDate: Day | null;
  /** Days since the price was recorded; null when unpriced. */
  priceAgeDays: number | null;
  marketValue: string;
  unrealized: string;
  unrealizedPct: string | null;
  realized: string;
  trades: TradeDTO[];
  prices: { id: string; date: Day; price: string }[];
}

export interface InvestmentAccountDTO {
  accountId: string;
  name: string;
  currency: string;
  color: string;
  icon: string;
  /** Ledger balance: money moved in minus money moved out. */
  contributed: string;
  cash: string;
  value: string;
  holdings: HoldingDTO[];
}

export interface InvestmentsDTO {
  baseCurrency: string;
  accounts: InvestmentAccountDTO[];
  /** Base-currency accounts only (no FX on gains); `otherCurrencyCount` says how many are left out. */
  totals: {
    invested: string;
    marketValue: string;
    cash: string;
    unrealized: string;
    unrealizedPct: string | null;
    realized: string;
    otherCurrencyCount: number;
    unpricedCount: number;
  };
  allocation: { assetClass: string; value: string; pct: string }[];
}

const daysBetween = (from: Day, to: Day) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export async function getInvestments(userId: string, baseCurrency: string, today: Day): Promise<InvestmentsDTO> {
  const [overview, holdingsByAccount] = await Promise.all([getAccountsOverview(userId, baseCurrency), loadHoldings(userId)]);
  const accounts = overview.accounts.filter((a) => a.type === "INVESTMENT" && !a.isArchived);

  const out: InvestmentAccountDTO[] = accounts.map((a) => {
    const raw = holdingsByAccount.get(a.id) ?? [];
    const holdings: HoldingDTO[] = raw.map((h) => {
      const v = valueHolding(h.trades, h.prices, today);
      return {
        id: h.id,
        accountId: a.id,
        name: h.name,
        symbol: h.symbol,
        assetClass: h.assetClass,
        notes: h.notes,
        units: v.units.toString(),
        cost: toMoneyString(v.cost),
        averageCost: v.averageCost ? v.averageCost.toDecimalPlaces(4).toString() : null,
        price: v.price ? v.price.toString() : null,
        priceDate: v.priceDate,
        priceAgeDays: v.priceDate ? daysBetween(v.priceDate, today) : null,
        marketValue: toMoneyString(v.marketValue),
        unrealized: toMoneyString(v.unrealized),
        unrealizedPct: returnPct(v.unrealized, v.cost)?.toFixed(1) ?? null,
        realized: toMoneyString(v.realized),
        trades: [...h.trades].reverse().map((t) => ({
          id: t.id,
          side: t.side,
          date: t.date,
          units: toMoney(t.units).toString(),
          amount: toMoneyString(t.amount),
          notes: t.notes,
        })),
        prices: [...h.prices].reverse().map((p) => ({ id: p.id, date: p.date, price: toMoney(p.price).toString() })),
      };
    });
    return {
      accountId: a.id,
      name: a.name,
      currency: a.currency,
      color: a.color,
      icon: a.icon,
      contributed: a.balance,
      cash: toMoneyString(uninvestedCash(a.balance, raw, today)),
      value: a.value,
      holdings,
    };
  });

  const inBase = out.filter((a) => a.currency === baseCurrency);
  const held = inBase.flatMap((a) => a.holdings);
  const invested = sum(held.map((h) => h.cost));
  const unrealized = sum(held.map((h) => h.unrealized));
  const byClass = new Map<string, Money>();
  for (const h of held) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? ZERO).plus(toMoney(h.marketValue)));
  const marketValue = sum(held.map((h) => h.marketValue));

  return {
    baseCurrency,
    accounts: out,
    totals: {
      invested: toMoneyString(invested),
      marketValue: toMoneyString(marketValue),
      cash: toMoneyString(sum(inBase.map((a) => a.cash))),
      unrealized: toMoneyString(unrealized),
      unrealizedPct: returnPct(unrealized, invested)?.toFixed(1) ?? null,
      realized: toMoneyString(sum(held.map((h) => h.realized))),
      otherCurrencyCount: out.length - inBase.length,
      unpricedCount: held.filter((h) => h.price === null && toMoney(h.units).greaterThan(0)).length,
    },
    allocation: marketValue.greaterThan(0)
      ? [...byClass.entries()]
          .filter(([, v]) => v.greaterThan(0))
          .sort((x, y) => y[1].comparedTo(x[1]))
          .map(([assetClass, v]) => ({ assetClass, value: toMoneyString(v), pct: v.div(marketValue).times(100).toFixed(1) }))
      : [],
  };
}
