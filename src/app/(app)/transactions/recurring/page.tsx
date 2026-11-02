import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { RecurringView } from "@/features/recurring/components/recurring-view";
import { TransactionsTabs } from "@/features/transactions/components/transactions-tabs";
import { requireUser } from "@/server/auth";
import { getComposerData } from "@/server/queries/composer.query";
import { getRecurringRules } from "@/server/queries/recurring.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Recurring transactions" };

export default async function RecurringPage() {
  const user = await requireUser();
  const [rules, data, prefs] = await Promise.all([
    getRecurringRules(user.id),
    getComposerData(user.id, user.baseCurrency, user.timezone),
    getPreferences(user.id),
  ]);
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Transactions" description="Income, expenses and transfers, including the ones that repeat." />
      <TransactionsTabs />
      <RecurringView rules={rules} data={data} pref={prefs.numberFormat} />
    </PageContainer>
  );
}
