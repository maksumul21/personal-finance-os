import { afterAll, afterEach, describe, expect, it } from "vitest";
import { holdingSchema, priceSchema, tradeSchema, type HoldingInput, type PriceInput, type TradeInput } from "@/features/investments/schemas";
import { transactionFormSchema } from "@/features/transactions/schemas";
import { db } from "@/server/db";
import { getAccountsOverview } from "@/server/queries/accounts.query";
import { getDashboard } from "@/server/queries/dashboard.query";
import { getInvestments } from "@/server/queries/investments.query";
import { getTransactionPage } from "@/server/queries/transactions.query";
import { createAccount, deleteAccount, updateAccount } from "@/server/services/accounts.service";
import { createHolding, deleteHolding, deleteTrade, recordPrice, recordTrade } from "@/server/services/investments.service";
import { createTransaction } from "@/server/services/transactions.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

const holding = (v: HoldingInput) => holdingSchema.parse(v);
const trade = (v: TradeInput) => tradeSchema.parse(v);
const price = (v: PriceInput) => priceSchema.parse(v);

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const bank = (await createAccount(userId, accountValues({ name: "Bank", openingBalance: "100000" }))).id;
  const broker = (await createAccount(userId, accountValues({ name: "Brokerage", type: "INVESTMENT", openingBalance: "0" }))).id;
  // Move ৳50,000 into the brokerage account: a transfer, never an expense.
  await createTransaction(ctx, transactionFormSchema.parse({ type: "TRANSFER", fromAccountId: bank, toAccountId: broker, amount: "50000", date: "2026-10-01" }));
  const { id: stock } = await createHolding(userId, holding({ accountId: broker, name: "GP", symbol: "GP", assetClass: "STOCK" }));
  return { userId, ctx, bank, broker, stock };
}

describe("investments (D-029: market moves are not income or expenses)", () => {
  it("values holdings at the latest price; net worth follows, income and expenses don't", async () => {
    const s = await setup();
    await recordTrade(s.userId, trade({ holdingId: s.stock, side: "BUY", date: "2026-10-05", units: "100", amount: "30000" }));
    await recordPrice(s.userId, price({ holdingId: s.stock, date: "2026-10-31", price: "330" }));

    const inv = await getInvestments(s.userId, "BDT", "2026-11-02");
    const acct = inv.accounts[0];
    expect(acct.contributed).toBe("50000.00");
    expect(acct.cash).toBe("20000.00");
    expect(acct.value).toBe("53000.00"); // 20,000 cash + 100 × 330
    const h = acct.holdings[0];
    expect(h).toMatchObject({ units: "100", cost: "30000.00", marketValue: "33000.00", unrealized: "3000.00", unrealizedPct: "10.0", priceDate: "2026-10-31" });
    expect(inv.totals).toMatchObject({ invested: "30000.00", marketValue: "33000.00", cash: "20000.00", unrealized: "3000.00", unpricedCount: 0 });
    expect(inv.allocation).toEqual([{ assetClass: "STOCK", value: "33000.00", pct: "100.0" }]);

    const overview = await getAccountsOverview(s.userId, "BDT");
    expect(overview.totals.totalBalance).toBe("50000.00"); // bank only; investments stay out
    expect(overview.totals.netWorth).toBe("103000.00"); // 50,000 bank + 53,000 brokerage

    const page = await getTransactionPage(s.userId, { sort: "date_desc", page: 1, from: "2026-10-01", to: "2026-10-31" });
    expect(page.summary).toMatchObject({ income: "0.00", expenses: "0.00" });

    const dash = await getDashboard({
      userId: s.userId,
      baseCurrency: "BDT",
      today: "2026-11-02",
      period: { start: "2026-11-01", end: "2026-11-30" },
      trendMonths: 3,
      thresholds: { warnPct: 70, criticalPct: 90 },
      pref: "LAKH",
    });
    expect(dash.kpis.netWorth).toBe("103000.00");
    const oct = dash.months.find((m) => m.month === "2026-10")!;
    expect(oct.netWorth).toBe("103000.00"); // priced 31 Oct, so October's month-end matches
    const sep = dash.months.find((m) => m.month === "2026-09")!;
    expect(sep.netWorth).toBe("100000.00");
  });

  it("sales use average cost and book a realised gain; overselling and unfunded buys are refused", async () => {
    const s = await setup();
    await recordTrade(s.userId, trade({ holdingId: s.stock, side: "BUY", date: "2026-10-05", units: "100", amount: "30000" }));
    await recordTrade(s.userId, trade({ holdingId: s.stock, side: "BUY", date: "2026-10-06", units: "50", amount: "18000" }));
    // Avg cost 320. Sell 75 for 27,000 → cost out 24,000, realised +3,000.
    await recordTrade(s.userId, trade({ holdingId: s.stock, side: "SELL", date: "2026-10-20", units: "75", amount: "27000" }));
    const h = (await getInvestments(s.userId, "BDT", "2026-11-02")).accounts[0].holdings[0];
    expect(h).toMatchObject({ units: "75", cost: "24000.00", realized: "3000.00", averageCost: "320" });

    await expect(recordTrade(s.userId, trade({ holdingId: s.stock, side: "SELL", date: "2026-10-21", units: "76", amount: "1" }))).rejects.toThrow(/only 75 held/);
    // Cash on 22 Oct: 50,000 − 48,000 + 27,000 = 29,000.
    await expect(recordTrade(s.userId, trade({ holdingId: s.stock, side: "BUY", date: "2026-10-22", units: "1", amount: "29000.01" }))).rejects.toThrow(/enough cash/);
    // Before the transfer arrived there was no cash at all.
    await expect(recordTrade(s.userId, trade({ holdingId: s.stock, side: "BUY", date: "2026-09-30", units: "1", amount: "10" }))).rejects.toThrow(/enough cash/);

    // Deleting the first buy would leave the sale uncovered.
    const first = await db.holdingTrade.findFirstOrThrow({ where: { holdingId: s.stock, side: "BUY" }, orderBy: { date: "asc" } });
    await expect(deleteTrade(s.userId, first.id)).rejects.toThrow(/held/);
  });

  it("guards accounts with holdings and isolates users", async () => {
    const s = await setup();
    const other = await setup();
    await expect(deleteAccount(s.userId, s.broker)).rejects.toThrow();
    await expect(updateAccount(s.userId, s.broker, accountValues({ name: "Brokerage", type: "SAVINGS" }))).rejects.toThrow(/holdings/);
    await expect(createHolding(s.userId, holding({ accountId: s.bank, name: "X", assetClass: "STOCK" }))).rejects.toThrow(/investment account/);
    await expect(createHolding(other.userId, holding({ accountId: s.broker, name: "X", assetClass: "STOCK" }))).rejects.toThrow(/not found/);
    await expect(recordTrade(other.userId, trade({ holdingId: s.stock, side: "BUY", date: "2026-10-05", units: "1", amount: "1" }))).rejects.toThrow(/not found/);
    await expect(recordPrice(other.userId, price({ holdingId: s.stock, date: "2026-10-05", price: "1" }))).rejects.toThrow(/not found/);
    await expect(deleteHolding(other.userId, s.stock)).rejects.toThrow(/not found/);
    expect((await getInvestments(other.userId, "BDT", "2026-11-02")).accounts.map((a) => a.accountId)).toEqual([other.broker]);
  });
});
