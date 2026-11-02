import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { BudgetsList } from "@/features/budgets/components/budgets-list";
import { requireUser } from "@/server/auth";
import { listBudgets } from "@/server/queries/budgets.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const user = await requireUser();
  const prefs = await getPreferences(user.id);
  const today = todayIn(user.timezone);
  const budgets = await listBudgets(user.id, today, { warnPct: prefs.budgetWarnPct, criticalPct: prefs.budgetCriticalPct });
  return (
    <PageContainer>
      <BudgetsList budgets={budgets} currency={user.baseCurrency} pref={prefs.numberFormat} today={today} />
    </PageContainer>
  );
}
