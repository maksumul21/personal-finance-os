import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { DebtsView } from "@/features/debts/components/debts-view";
import { debtParamsSchema } from "@/features/debts/schemas";
import { requireUser } from "@/server/auth";
import { getComposerData } from "@/server/queries/composer.query";
import { getDebts } from "@/server/queries/debts.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Debt management" };

export default async function DebtsPage(props: PageProps<"/debts">) {
  const user = await requireUser();
  const params = debtParamsSchema.parse(await props.searchParams);
  const today = todayIn(user.timezone);
  const [data, prefs, composer] = await Promise.all([
    getDebts(user.id, user.baseCurrency, today, params.extra ?? "0"),
    getPreferences(user.id),
    getComposerData(user.id, user.baseCurrency, user.timezone),
  ]);
  return (
    <PageContainer>
      <DebtsView data={data} accounts={composer.accounts} categories={composer.categories} pref={prefs.numberFormat} today={today} />
    </PageContainer>
  );
}
