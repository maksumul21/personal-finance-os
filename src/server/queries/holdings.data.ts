import "server-only";
import type { PricePoint, Trade } from "@/domain/investments";
import { dbToDay } from "@/domain/period";
import { db } from "../db";

export interface HoldingData {
  id: string;
  accountId: string;
  name: string;
  symbol: string | null;
  assetClass: string;
  notes: string | null;
  trades: (Trade & { id: string; notes: string | null })[];
  prices: (PricePoint & { id: string })[];
}

/** Every holding with its trades (in replay order) and recorded prices, grouped by account. */
export async function loadHoldings(userId: string): Promise<Map<string, HoldingData[]>> {
  const rows = await db.holding.findMany({
    where: { userId },
    orderBy: [{ name: "asc" }],
    include: {
      trades: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
      prices: { orderBy: { date: "asc" } },
    },
  });
  const byAccount = new Map<string, HoldingData[]>();
  for (const h of rows) {
    const list = byAccount.get(h.accountId) ?? [];
    list.push({
      id: h.id,
      accountId: h.accountId,
      name: h.name,
      symbol: h.symbol,
      assetClass: h.assetClass,
      notes: h.notes,
      trades: h.trades.map((t) => ({ id: t.id, side: t.side, date: dbToDay(t.date), units: t.units.toString(), amount: t.amount.toString(), notes: t.notes })),
      prices: h.prices.map((p) => ({ id: p.id, date: dbToDay(p.date), price: p.price.toString() })),
    });
    byAccount.set(h.accountId, list);
  }
  return byAccount;
}
