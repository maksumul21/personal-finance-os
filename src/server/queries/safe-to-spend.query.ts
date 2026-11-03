import "server-only";
import { ZERO, toMoney, toMoneyString } from "@/domain/money";
import { addDaysTo, endOfMonthDay, type Day } from "@/domain/period";
import { safeToSpend, windowEnd, type Commitment, type GoalNeed } from "@/domain/safe-to-spend";
import { getAccountsOverview } from "./accounts.query";
import { getGoals } from "./goals.query";
import { getScheduledFlows } from "./scheduled-flows";

export interface SafeToSpendDTO {
  today: Day;
  windowEnd: Day;
  /** True when the window ends the day before scheduled income; false = month-end fallback. */
  untilIncome: boolean;
  daysLeft: number;
  available: string;
  committed: string;
  goalSetAside: string;
  safe: string;
  perDay: string | null;
  accounts: { id: string; name: string; balance: string }[];
  commitments: { kind: Commitment["kind"]; title: string; date: Day; amount: string }[];
  goals: { title: string; amount: string }[];
  /** Included accounts or commitments left out for lack of an exchange rate. */
  unconvertedCount: number;
}

export async function getSafeToSpend(userId: string, baseCurrency: string, today: Day): Promise<SafeToSpendDTO> {
  const monthEnd = endOfMonthDay(today);
  const [overview, goals] = await Promise.all([getAccountsOverview(userId, baseCurrency), getGoals(userId, today)]);

  // Spendable money: active asset accounts the user marked, never investment accounts.
  const eligible = overview.accounts.filter((a) => !a.isArchived && a.includeInSafeToSpend && a.nature === "ASSET" && a.type !== "INVESTMENT");
  const included = eligible.filter((a) => a.baseBalance !== null);
  const includedIds = new Set(included.map((a) => a.id));

  // Next income can fall after month-end, so look a year ahead and cut at the window's end.
  const scheduled = await getScheduledFlows(userId, baseCurrency, today, addDaysTo(today, 366), includedIds);
  const nextIncome = scheduled.nextIncome;
  const end = windowEnd(today, monthEnd, nextIncome);
  const unconvertedCount = eligible.length - included.length + scheduled.unconvertedCount;

  // Only money leaving the pool is a commitment; scheduled income isn't spent before it arrives.
  const commitments: Commitment[] = scheduled.flows
    .filter((f) => f.date <= end && f.amount.isNegative() && f.kind !== "INCOME")
    .map((f) => ({ kind: f.kind as Commitment["kind"], title: f.title, date: f.date, amount: f.amount.negated() }));

  // Goals: what's still needed this month to stay on pace (net deposits so far count).
  const monthStart = `${today.slice(0, 7)}-01`;
  const goalNeeds: GoalNeed[] = goals
    .filter((g) => g.status === "ACTIVE" && g.requiredMonthly && toMoney(g.requiredMonthly).greaterThan(0))
    .map((g) => {
      let saved = ZERO;
      for (const c of g.contributions) {
        if (c.date < monthStart || c.date > today) continue;
        saved = c.direction === "DEPOSIT" ? saved.plus(toMoney(c.amount)) : saved.minus(toMoney(c.amount));
      }
      return { title: g.name, requiredMonthly: g.requiredMonthly!, savedThisMonth: saved };
    });

  const r = safeToSpend({ today, monthEnd, nextIncome, balances: included.map((a) => a.baseBalance!), commitments, goals: goalNeeds });
  return {
    today,
    windowEnd: r.windowEnd,
    untilIncome: nextIncome !== null,
    daysLeft: r.daysLeft,
    available: toMoneyString(r.available),
    committed: toMoneyString(r.committed),
    goalSetAside: toMoneyString(r.goalSetAside),
    safe: toMoneyString(r.safe),
    perDay: r.perDay ? toMoneyString(r.perDay) : null,
    accounts: included.map((a) => ({ id: a.id, name: a.name, balance: a.baseBalance! })),
    commitments: r.commitments.map((c) => ({ kind: c.kind, title: c.title, date: c.date, amount: toMoneyString(c.amount) })),
    goals: r.goals.map((g) => ({ title: g.title, amount: toMoneyString(g.amount) })),
    unconvertedCount,
  };
}
