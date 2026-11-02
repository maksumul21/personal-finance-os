import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageContainer } from "@/components/layout/page";
import { BudgetDetail } from "@/features/budgets/components/budget-detail";
import { requireUser } from "@/server/auth";
import { getBudgetDetail } from "@/server/queries/budgets.query";
import { getComposerData } from "@/server/queries/composer.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage(props: PageProps<"/budgets/[id]">) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireUser();
  const prefs = await getPreferences(user.id);
  const [budget, composer] = await Promise.all([
    getBudgetDetail(user.id, id, { warnPct: prefs.budgetWarnPct, criticalPct: prefs.budgetCriticalPct }),
    getComposerData(user.id, user.baseCurrency, user.timezone),
  ]);
  if (!budget) notFound();
  return (
    <PageContainer>
      <BudgetDetail budget={budget} categories={composer.categories} currency={user.baseCurrency} pref={prefs.numberFormat} />
    </PageContainer>
  );
}
