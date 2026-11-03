import "server-only";
import { projectBalances, typicalDailySpend, type ForecastHorizon } from "@/domain/forecast";
import { incomeExpenseTotals } from "@/domain/ledger";
import { sum, toMoneyString } from "@/domain/money";
import { addDaysTo, dayToDb, dbToDay, type Day } from "@/domain/period";
import { db } from "../db";
import { getAccountsOverview } from "./accounts.query";
import { getScheduledFlows, type FlowKind } from "./scheduled-flows";

/** How far back the day-to-day spending average looks. */
const SPEND_LOOKBACK_DAYS = 90;

export interface ForecastDTO {
  today: Day;
  end: Day;
  horizon: ForecastHorizon;
  includeDayToDay: boolean;
  start: string;
  accounts: { id: string; name: string; balance: string }[];
  dailySpend: string;
  /** Days of history behind the daily spend average. */
  spendBasisDays: number;
  points: { date: Day; balance: string }[];
  lowest: { date: Day; balance: string };
  firstNegative: Day | null;
  endBalance: string;
  scheduledIn: string;
  scheduledOut: string;
  dayToDay: string;
  flows: { kind: FlowKind; title: string; date: Day; amount: string; balanceAfter: string }[];
  unconvertedCount: number;
}

/**
 * Projects the cash pool (active asset accounts other than investments, i.e. the Total balance
 * accounts) day by day: scheduled flows plus, optionally, typical unscheduled spending (D-033).
 */
export async function getForecast(userId: string, baseCurrency: string, today: Day, horizon: ForecastHorizon, includeDayToDay: boolean): Promise<ForecastDTO> {
  const end = addDaysTo(today, horizon - 1);
  const overview = await getAccountsOverview(userId, baseCurrency);
  const eligible = overview.accounts.filter((a) => !a.isArchived && a.nature === "ASSET" && a.type !== "INVESTMENT");
  const pool = eligible.filter((a) => a.baseBalance !== null);
  const poolIds = new Set(pool.map((a) => a.id));

  const lookbackFrom = addDaysTo(today, -(SPEND_LOOKBACK_DAYS - 1));
  const [scheduled, unscheduled, first] = await Promise.all([
    getScheduledFlows(userId, baseCurrency, today, end, poolIds),
    // Day-to-day = expenses not created by bills, schedules or loans (refunds reduce it).
    db.transaction.groupBy({
      by: ["type", "isRefund"],
      where: { userId, type: "EXPENSE", source: { in: ["MANUAL", "IMPORT"] }, date: { gte: dayToDb(lookbackFrom), lte: dayToDb(today) } },
      _sum: { baseAmount: true },
    }),
    db.transaction.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const historyStart = first && dbToDay(first.date) > lookbackFrom ? dbToDay(first.date) : lookbackFrom;
  const spendBasisDays = first ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${historyStart}T00:00:00Z`)) / 86_400_000) + 1 : 0;
  const { expenses } = incomeExpenseTotals(unscheduled.map((r) => ({ type: r.type, isRefund: r.isRefund, baseAmount: r._sum.baseAmount ?? 0 })));
  const dailySpend = typicalDailySpend(expenses.isNegative() ? 0 : expenses, spendBasisDays);

  const start = sum(pool.map((a) => a.baseBalance!));
  const f = projectBalances({
    today,
    end,
    start,
    flows: scheduled.flows.map((x) => ({ date: x.date, amount: x.amount })),
    dailySpend: includeDayToDay ? dailySpend : 0,
  });
  const balanceOn = new Map(f.points.map((p) => [p.date, p.balance]));

  return {
    today,
    end,
    horizon,
    includeDayToDay,
    start: toMoneyString(start),
    accounts: pool.map((a) => ({ id: a.id, name: a.name, balance: a.baseBalance! })),
    dailySpend: toMoneyString(dailySpend),
    spendBasisDays,
    points: f.points.map((p) => ({ date: p.date, balance: toMoneyString(p.balance) })),
    lowest: { date: f.lowest.date, balance: toMoneyString(f.lowest.balance) },
    firstNegative: f.firstNegative,
    endBalance: toMoneyString(f.endBalance),
    scheduledIn: toMoneyString(f.scheduledIn),
    scheduledOut: toMoneyString(f.scheduledOut),
    dayToDay: toMoneyString(f.dayToDay),
    flows: scheduled.flows
      .filter((x) => x.date <= end)
      .map((x) => {
        const shown = x.date < today ? today : x.date;
        return { kind: x.kind, title: x.title, date: x.date, amount: toMoneyString(x.amount), balanceAfter: toMoneyString(balanceOn.get(shown)!) };
      }),
    unconvertedCount: eligible.length - pool.length + scheduled.unconvertedCount,
  };
}
