import "server-only";
import { TradeError, position, sortTrades, uninvestedCash, type Trade } from "@/domain/investments";
import { toMoney } from "@/domain/money";
import { dayToDb, dbToDay, type Day } from "@/domain/period";
import type { HoldingValues, PriceValues, TradeValues } from "@/features/investments/schemas";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db, type DbTx } from "../db";

/** Holdings live in active INVESTMENT accounts the user owns. */
async function investmentAccount(tx: DbTx, userId: string, id: string) {
  const account = await tx.account.findFirst({ where: { id, userId } });
  if (!account) throw new UserFacingError("Account not found.", "accountId");
  if (account.type !== "INVESTMENT") throw new UserFacingError("Holdings go in an investment account.", "accountId");
  if (account.isArchived) throw new UserFacingError(`“${account.name}” is archived.`, "accountId");
  return account;
}

async function ownedHolding(tx: DbTx, userId: string, id: string) {
  const holding = await tx.holding.findFirst({ where: { id, userId }, include: { account: true } });
  if (!holding) throw new UserFacingError("Holding not found.");
  return holding;
}

function toTrade(t: { side: "BUY" | "SELL"; date: Date; units: unknown; amount: unknown }): Trade {
  return { side: t.side, date: dbToDay(t.date), units: String(t.units), amount: String(t.amount) };
}

/** The account's ledger balance on `asOf`: opening (if open by then) + entries up to that date. */
async function ledgerBalanceOn(tx: DbTx, userId: string, account: { id: string; openingBalance: unknown; openingDate: Date }, asOf: Day) {
  const agg = await tx.ledgerEntry.aggregate({ where: { userId, accountId: account.id, date: { lte: dayToDb(asOf) } }, _sum: { amount: true } });
  const opening = dbToDay(account.openingDate) <= asOf ? toMoney(String(account.openingBalance)) : toMoney(0);
  return opening.plus(toMoney(agg._sum.amount ?? 0));
}

/**
 * Checks the account's trades are consistent with `changed` applied: no sale exceeds units held
 * and, on the dates of buys, the account has the cash for them (money must be moved in first).
 */
async function assertConsistent(tx: DbTx, userId: string, account: { id: string; name: string; openingBalance: unknown; openingDate: Date }, override: { holdingId: string; trades: Trade[] }) {
  const holdings = await tx.holding.findMany({ where: { accountId: account.id, userId }, include: { trades: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } } });
  const all = holdings.map((h) => ({ id: h.id, trades: h.id === override.holdingId ? sortTrades(override.trades) : h.trades.map(toTrade) }));
  for (const h of all) {
    try {
      position(h.trades);
    } catch (err) {
      if (err instanceof TradeError) throw new UserFacingError(err.message, "units");
      throw err;
    }
  }
  const buyDates = [...new Set(override.trades.filter((t) => t.side === "BUY").map((t) => t.date))];
  for (const date of buyDates) {
    const cash = uninvestedCash(await ledgerBalanceOn(tx, userId, account, date), all, date);
    if (cash.isNegative()) {
      throw new UserFacingError(
        `“${account.name}” didn't have enough cash on ${date} (short by ${cash.negated().toFixed(2)}). Transfer money into it first.`,
        "amount",
      );
    }
  }
}

// ───────────────────────────── Holdings ─────────────────────────────

export async function createHolding(userId: string, values: HoldingValues) {
  return db.$transaction(async (tx) => {
    await investmentAccount(tx, userId, values.accountId);
    const h = await tx.holding.create({
      data: { userId, accountId: values.accountId, name: values.name, symbol: values.symbol || null, assetClass: values.assetClass, notes: values.notes || null },
    });
    await audit(tx, userId, "holding.create", "Holding", h.id, undefined, values);
    return { id: h.id };
  });
}

export async function updateHolding(userId: string, id: string, values: HoldingValues) {
  return db.$transaction(async (tx) => {
    const before = await ownedHolding(tx, userId, id);
    if (values.accountId !== before.accountId) {
      throw new UserFacingError("A holding can't move to another account. Sell it there and buy it here instead.", "accountId");
    }
    await tx.holding.update({ where: { id: before.id }, data: { name: values.name, symbol: values.symbol || null, assetClass: values.assetClass, notes: values.notes || null } });
    await audit(tx, userId, "holding.update", "Holding", id, before, values);
    return { id };
  });
}

/** Deletes the holding with its trades and prices; its cost goes back to the account's cash. */
export async function deleteHolding(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const before = await ownedHolding(tx, userId, id);
    await tx.holding.delete({ where: { id: before.id } });
    await audit(tx, userId, "holding.delete", "Holding", id, before);
    return { id };
  });
}

// ───────────────────────────── Trades ─────────────────────────────

export async function recordTrade(userId: string, v: TradeValues) {
  return db.$transaction(async (tx) => {
    const holding = await ownedHolding(tx, userId, v.holdingId);
    if (holding.account.isArchived) throw new UserFacingError(`“${holding.account.name}” is archived.`);
    const existing = await tx.holdingTrade.findMany({ where: { holdingId: holding.id }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
    const trade: Trade = { side: v.side, date: v.date, units: v.units, amount: v.amount };
    await assertConsistent(tx, userId, holding.account, { holdingId: holding.id, trades: [...existing.map(toTrade), trade] });
    const t = await tx.holdingTrade.create({
      data: { userId, holdingId: holding.id, side: v.side, date: dayToDb(v.date), units: v.units, amount: v.amount, notes: v.notes || null },
    });
    await audit(tx, userId, `holding.${v.side.toLowerCase()}`, "HoldingTrade", t.id, undefined, v);
    return { id: t.id };
  });
}

/** Removing a trade must leave every later sale covered and every buy funded. */
export async function deleteTrade(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const t = await tx.holdingTrade.findFirst({ where: { id, userId }, include: { holding: { include: { account: true } } } });
    if (!t) throw new UserFacingError("Trade not found.");
    const rest = await tx.holdingTrade.findMany({ where: { holdingId: t.holdingId, NOT: { id } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
    await assertConsistent(tx, userId, t.holding.account, { holdingId: t.holdingId, trades: rest.map(toTrade) });
    await tx.holdingTrade.delete({ where: { id: t.id } });
    await audit(tx, userId, "holding.trade.delete", "HoldingTrade", id, t);
    return { id };
  });
}

// ───────────────────────────── Prices ─────────────────────────────

/** Records (or corrects) the price per unit on a date. */
export async function recordPrice(userId: string, v: PriceValues) {
  return db.$transaction(async (tx) => {
    const holding = await ownedHolding(tx, userId, v.holdingId);
    const date = dayToDb(v.date);
    const p = await tx.holdingPrice.upsert({
      where: { holdingId_date: { holdingId: holding.id, date } },
      create: { userId, holdingId: holding.id, date, price: v.price },
      update: { price: v.price },
    });
    await audit(tx, userId, "holding.price", "HoldingPrice", p.id, undefined, v);
    return { id: p.id };
  });
}

export async function deletePrice(userId: string, id: string) {
  const { count } = await db.holdingPrice.deleteMany({ where: { id, userId } });
  if (count === 0) throw new UserFacingError("Price not found.");
  return { id };
}

