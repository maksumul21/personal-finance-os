import "server-only";
import { format, parseISO } from "date-fns";
import { pickRate, toBase, type RecordedRate } from "@/domain/fx";
import { valuationAdjustment } from "@/domain/investments";
import { ZERO, sum, toMoney, toMoneyString, type Money } from "@/domain/money";
import { manualContribution, netWorthChange, valueOn } from "@/domain/net-worth";
import { dayToDb, dbToDay, endOfMonthDay, monthsEnding, type Day } from "@/domain/period";
import { db } from "../db";
import { getAccountsOverview } from "./accounts.query";
import { loadHoldings } from "./holdings.data";

export interface ManualItemDTO {
  id: string;
  name: string;
  kind: "ASSET" | "LIABILITY";
  category: string;
  currency: string;
  notes: string | null;
  isArchived: boolean;
  /** Value in force today (item currency); null before the first valuation. */
  value: string | null;
  valueDate: Day | null;
  /** Converted with the latest recorded rate; null without one. */
  baseValue: string | null;
  valuations: { id: string; date: Day; value: string; note: string | null }[];
}

type ManualRow = Awaited<ReturnType<typeof loadManualItems>>[number];

/** Every manual item with its valuations, oldest first. */
export async function loadManualItems(userId: string) {
  const rows = await db.manualItem.findMany({
    where: { userId },
    orderBy: [{ isArchived: "asc" }, { kind: "asc" }, { name: "asc" }],
    include: { valuations: { orderBy: { date: "asc" } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    category: r.category,
    currency: r.currency,
    notes: r.notes,
    isArchived: r.isArchived,
    valuations: r.valuations.map((v) => ({ id: v.id, date: dbToDay(v.date), value: v.value.toString(), note: v.note })),
  }));
}

function loadRates(userId: string) {
  return db.exchangeRate
    .findMany({ where: { userId }, select: { currency: true, date: true, rate: true } })
    .then((rates) => rates.map((r) => ({ currency: r.currency, date: dbToDay(r.date), rate: r.rate })));
}

/**
 * Signed base-currency total of active manual items on `asOf` (assets − liabilities), and how
 * many couldn't be converted for lack of a rate (they are left out, like accounts).
 */
function manualNet(items: ManualRow[], rates: RecordedRate[], baseCurrency: string, asOf: Day) {
  let total = ZERO;
  let unconverted = 0;
  for (const i of items) {
    if (i.isArchived) continue;
    const signed = manualContribution(i, asOf);
    if (signed.isZero()) continue;
    const base = toBase(signed, i.currency, baseCurrency, pickRate(rates, i.currency, "9999-12-31"));
    if (base === null) unconverted++;
    else total = total.plus(base);
  }
  return { total, unconverted };
}

/** Manual items' part of today's net worth, for the dashboard KPI. */
export async function manualNetToday(userId: string, baseCurrency: string, today: Day) {
  const [items, rates] = await Promise.all([loadManualItems(userId), loadRates(userId)]);
  return manualNet(items, rates, baseCurrency, today);
}

/**
 * Month-end net worth for each `yyyy-MM` month: active accounts (opening balances from their
 * opening date, investment accounts at market value as of month-end) + manual items valued
 * as of month-end. Null for a month that can't be valued honestly (missing exchange rate).
 */
export async function netWorthSeries(userId: string, baseCurrency: string, months: string[]): Promise<(Money | null)[]> {
  const lastDay = endOfMonthDay(`${months.at(-1)}-01`);
  const [accounts, entries, rates, holdings, items] = await Promise.all([
    db.account.findMany({ where: { userId, isArchived: false }, select: { id: true, currency: true, openingBalance: true, openingDate: true } }),
    db.$queryRaw<{ month: string; total: unknown }[]>`
      SELECT to_char(date_trunc('month', e."date"), 'YYYY-MM') AS month, SUM(e."baseAmount") AS total
      FROM "LedgerEntry" e JOIN "Account" a ON a."id" = e."accountId"
      WHERE e."userId" = ${userId}::uuid AND NOT a."isArchived" AND e."date" <= ${dayToDb(lastDay)}::date
      GROUP BY 1 ORDER BY 1`,
    loadRates(userId),
    loadHoldings(userId),
    loadManualItems(userId),
  ]);

  return months.map((m) => {
    const end = endOfMonthDay(`${m}-01`);
    let total = ZERO;
    for (const a of accounts) {
      if (dbToDay(a.openingDate) > end) continue;
      const rate = pickRate(rates, a.currency, "9999-12-31");
      const opening = toMoney(a.openingBalance).plus(valuationAdjustment(holdings.get(a.id) ?? [], end));
      const base = toBase(opening, a.currency, baseCurrency, rate);
      if (base === null) return null; // can't value this month honestly
      total = total.plus(base);
    }
    for (const e of entries) if (e.month <= m) total = total.plus(toMoney(String(e.total)));
    const manual = manualNet(items, rates, baseCurrency, end);
    if (manual.unconverted > 0) return null;
    return total.plus(manual.total);
  });
}

export interface NetWorthDTO {
  baseCurrency: string;
  today: Day;
  netWorth: string;
  totalAssets: string;
  totalLiabilities: string;
  unconvertedCount: number;
  /** Rows of the balance sheet, base currency. Liabilities are positive amounts owed. */
  groups: { key: string; label: string; side: "ASSET" | "LIABILITY"; amount: string }[];
  history: { month: string; label: string; netWorth: string | null }[];
  change: {
    monthAmount: string | null;
    monthPct: string | null;
    yearAmount: string | null;
    yearPct: string | null;
  };
  items: ManualItemDTO[];
}

export async function getNetWorth(userId: string, baseCurrency: string, today: Day, historyMonths = 12): Promise<NetWorthDTO> {
  const months = monthsEnding(today, historyMonths + 1);
  const [overview, items, rates, series] = await Promise.all([
    getAccountsOverview(userId, baseCurrency),
    loadManualItems(userId),
    loadRates(userId),
    netWorthSeries(userId, baseCurrency, months),
  ]);

  const active = overview.accounts.filter((a) => !a.isArchived && a.baseValue !== null);
  const groupSum = (pred: (a: (typeof active)[number]) => boolean) => sum(active.filter(pred).map((a) => a.baseValue!));
  const cashBank = groupSum((a) => a.nature === "ASSET" && a.type !== "INVESTMENT");
  const investments = groupSum((a) => a.type === "INVESTMENT");
  // Liability accounts in credit count as assets; owed amounts as liabilities.
  const liabilityAccounts = (type: string) => active.filter((a) => a.type === type).map((a) => toMoney(a.baseValue!));
  const owed = (type: string) => sum(liabilityAccounts(type).filter((v) => v.isNegative()).map((v) => v.negated()));
  const inCredit = sum(["CREDIT_CARD", "LOAN"].flatMap(liabilityAccounts).filter((v) => v.isPositive()));

  const itemDTOs: ManualItemDTO[] = items.map((i) => {
    const v = valueOn(i.valuations, today);
    const base = v ? toBase(v.value, i.currency, baseCurrency, pickRate(rates, i.currency, "9999-12-31")) : null;
    return {
      id: i.id,
      name: i.name,
      kind: i.kind,
      category: i.category,
      currency: i.currency,
      notes: i.notes,
      isArchived: i.isArchived,
      value: v ? toMoneyString(v.value) : null,
      valueDate: v?.date ?? null,
      baseValue: v ? (base ? toMoneyString(base) : null) : null,
      valuations: [...i.valuations].reverse().map((x) => ({ ...x, value: toMoneyString(x.value) })),
    };
  });
  const activeItems = itemDTOs.filter((i) => !i.isArchived && i.baseValue !== null);
  const manualAssets = sum(activeItems.filter((i) => i.kind === "ASSET").map((i) => i.baseValue!));
  const manualLiabilities = sum(activeItems.filter((i) => i.kind === "LIABILITY").map((i) => i.baseValue!));

  const groups: NetWorthDTO["groups"] = [
    { key: "cash", label: "Cash, bank & wallets", side: "ASSET" as const, amount: cashBank.plus(inCredit) },
    { key: "investments", label: "Investments (market value)", side: "ASSET" as const, amount: investments },
    { key: "manual-assets", label: "Other assets", side: "ASSET" as const, amount: manualAssets },
    { key: "cards", label: "Credit cards", side: "LIABILITY" as const, amount: owed("CREDIT_CARD") },
    { key: "loans", label: "Loans", side: "LIABILITY" as const, amount: owed("LOAN") },
    { key: "manual-liabilities", label: "Other liabilities", side: "LIABILITY" as const, amount: manualLiabilities },
  ].map((g) => ({ ...g, amount: toMoneyString(g.amount) }));

  const totalAssets = sum(groups.filter((g) => g.side === "ASSET").map((g) => g.amount));
  const totalLiabilities = sum(groups.filter((g) => g.side === "LIABILITY").map((g) => g.amount));
  const netWorth = totalAssets.minus(totalLiabilities);

  const history = months.slice(1).map((m, i) => ({
    month: m,
    label: format(parseISO(`${m}-01`), "MMM yy"),
    netWorth: series[i + 1] ? toMoneyString(series[i + 1]!) : null,
  }));
  // Compare today's figure with the end of last month and with 12 months before that.
  const lastMonthEnd = series.at(-2) ?? null;
  const yearAgo = series[0] ?? null;
  const fmt = (c: ReturnType<typeof netWorthChange> | null) => ({
    amount: c ? toMoneyString(c.amount) : null,
    pct: c?.pct ? c.pct.toFixed(1) : null,
  });
  const month = fmt(lastMonthEnd ? netWorthChange(netWorth, lastMonthEnd) : null);
  const year = fmt(yearAgo ? netWorthChange(netWorth, yearAgo) : null);

  return {
    baseCurrency,
    today,
    netWorth: toMoneyString(netWorth),
    totalAssets: toMoneyString(totalAssets),
    totalLiabilities: toMoneyString(totalLiabilities),
    unconvertedCount:
      overview.accounts.filter((a) => !a.isArchived && a.baseValue === null).length +
      itemDTOs.filter((i) => !i.isArchived && i.value !== null && i.baseValue === null).length,
    groups,
    history,
    change: { monthAmount: month.amount, monthPct: month.pct, yearAmount: year.amount, yearPct: year.pct },
    items: itemDTOs,
  };
}
