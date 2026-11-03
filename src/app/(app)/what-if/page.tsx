import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { toMoney } from "@/domain/money";
import { todayIn } from "@/domain/period";
import { WhatIfView } from "@/features/what-if/components/what-if-view";
import { requireUser } from "@/server/auth";
import { getDebts } from "@/server/queries/debts.query";
import { getForecast } from "@/server/queries/forecast.query";
import { getGoals } from "@/server/queries/goals.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "What if" };

export default async function WhatIfPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const [debts, goals, forecast, prefs] = await Promise.all([
    getDebts(user.id, user.baseCurrency, today),
    getGoals(user.id, today),
    getForecast(user.id, user.baseCurrency, today, 90, true),
    getPreferences(user.id),
  ]);

  // Base-currency loans with details that are still owed; active goals with something left to save.
  const loans = debts.loans
    .filter((l) => l.terms && l.currency === user.baseCurrency && toMoney(l.outstanding).greaterThan(0))
    .map((l) => ({ id: l.accountId, name: l.name, outstanding: l.outstanding, annualRate: l.terms!.annualRate, emi: l.terms!.emiAmount }));
  const activeGoals = goals
    .filter((g) => g.status === "ACTIVE" && toMoney(g.remaining).greaterThan(0))
    .map((g) => ({ id: g.id, name: g.name, remaining: g.remaining, targetDate: g.targetDate, requiredMonthly: g.requiredMonthly }));

  return (
    <PageContainer>
      <WhatIfView
        loans={loans}
        goals={activeGoals}
        base={{
          today,
          end: forecast.end,
          start: forecast.start,
          flows: forecast.flows.map((f) => ({ date: f.date, amount: f.amount })),
          dailySpend: forecast.dailySpend,
        }}
        currency={user.baseCurrency}
        pref={prefs.numberFormat}
      />
    </PageContainer>
  );
}
