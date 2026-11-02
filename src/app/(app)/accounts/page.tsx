import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { AccountsView } from "@/features/accounts/components/accounts-view";
import { requireUser } from "@/server/auth";
import { getAccountsOverview } from "@/server/queries/accounts.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const user = await requireUser();
  const [overview, prefs] = await Promise.all([getAccountsOverview(user.id, user.baseCurrency), getPreferences(user.id)]);
  return (
    <PageContainer>
      <AccountsView overview={overview} pref={prefs.numberFormat} today={todayIn(user.timezone)} />
    </PageContainer>
  );
}
