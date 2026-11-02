import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { NetWorthView } from "@/features/net-worth/components/net-worth-view";
import { requireUser } from "@/server/auth";
import { getNetWorth } from "@/server/queries/net-worth.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Net worth" };

export default async function NetWorthPage() {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const [data, prefs] = await Promise.all([getNetWorth(user.id, user.baseCurrency, today), getPreferences(user.id)]);
  return (
    <PageContainer>
      <NetWorthView data={data} pref={prefs.numberFormat} />
    </PageContainer>
  );
}
