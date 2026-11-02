import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { GoalsView } from "@/features/goals/components/goals-view";
import { requireUser } from "@/server/auth";
import { getComposerData } from "@/server/queries/composer.query";
import { getGoals, suggestEssentialMonthly } from "@/server/queries/goals.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Savings goals" };

export default async function GoalsPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const [goals, prefs, composer, suggestion] = await Promise.all([
    getGoals(user.id, today),
    getPreferences(user.id),
    getComposerData(user.id, user.baseCurrency, user.timezone),
    suggestEssentialMonthly(user.id, today),
  ]);
  return (
    <PageContainer>
      <GoalsView
        goals={goals}
        accounts={composer.accounts}
        currency={user.baseCurrency}
        pref={prefs.numberFormat}
        today={today}
        suggestion={suggestion}
      />
    </PageContainer>
  );
}
