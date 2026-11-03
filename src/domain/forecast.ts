import { ZERO, round2, sum, toMoney, type Money, type MoneyInput } from "./money";
import { addDaysTo, type Day } from "./period";

/**
 * Cash-flow forecast (ROADMAP Phase 5, DECISIONS.md D-033). Pure, exact decimals, no I/O.
 *
 * Starting from today's balance, each day applies the scheduled flows dated that day and,
 * optionally, a typical day-to-day spend (from tomorrow; today's is already in the balance).
 * Overdue flows (dated before today) land on today.
 */

export const FORECAST_HORIZONS = [30, 90, 180] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export interface ForecastFlow {
  date: Day;
  /** Signed: + in, − out. */
  amount: MoneyInput;
}

export interface ForecastInput {
  today: Day;
  end: Day;
  start: MoneyInput;
  flows: ForecastFlow[];
  /** Typical unscheduled spending per day (positive), or 0 to leave it out. */
  dailySpend: MoneyInput;
}

export interface Forecast {
  points: { date: Day; balance: Money }[];
  lowest: { date: Day; balance: Money };
  /** First day the balance is below zero, if any. */
  firstNegative: Day | null;
  endBalance: Money;
  scheduledIn: Money;
  scheduledOut: Money;
  dayToDay: Money;
}

export function projectBalances(input: ForecastInput): Forecast {
  const spend = toMoney(input.dailySpend);
  const byDay = new Map<Day, Money>();
  for (const f of input.flows) {
    if (f.date > input.end) continue;
    const d = f.date < input.today ? input.today : f.date;
    byDay.set(d, (byDay.get(d) ?? ZERO).plus(toMoney(f.amount)));
  }

  const points: Forecast["points"] = [];
  let balance = toMoney(input.start);
  let dayToDay = ZERO;
  for (let d = input.today; d <= input.end; d = addDaysTo(d, 1)) {
    balance = balance.plus(byDay.get(d) ?? ZERO);
    if (d > input.today && spend.greaterThan(0)) {
      balance = balance.minus(spend);
      dayToDay = dayToDay.plus(spend);
    }
    points.push({ date: d, balance });
  }

  const lowest = points.reduce((lo, p) => (p.balance.lessThan(lo.balance) ? p : lo), points[0]);
  const amounts = input.flows.filter((f) => f.date <= input.end).map((f) => toMoney(f.amount));
  return {
    points,
    lowest,
    firstNegative: points.find((p) => p.balance.isNegative())?.date ?? null,
    endBalance: balance,
    scheduledIn: sum(amounts.filter((a) => a.isPositive())),
    scheduledOut: sum(amounts.filter((a) => a.isNegative())).negated(),
    dayToDay,
  };
}

/** Average daily spend over a period, to 2 dp. */
export function typicalDailySpend(total: MoneyInput, days: number): Money {
  return days > 0 ? round2(toMoney(total).div(days)) : ZERO;
}
