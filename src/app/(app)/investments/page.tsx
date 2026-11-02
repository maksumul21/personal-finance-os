import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { InvestmentsView } from "@/features/investments/components/investments-view";
import { requireUser } from "@/server/auth";
import { getInvestments } from "@/server/queries/investments.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Investments" };

export default async function InvestmentsPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const [data, prefs] = await Promise.all([getInvestments(user.id, user.baseCurrency, today), getPreferences(user.id)]);
  return (
    <PageContainer>
      <InvestmentsView data={data} pref={prefs.numberFormat} today={today} />
    </PageContainer>
  );
}
