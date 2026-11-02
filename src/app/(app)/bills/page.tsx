import type { Metadata } from "next";
import { z } from "zod";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { BillsView } from "@/features/bills/components/bills-view";
import { requireUser } from "@/server/auth";
import { getBills, getMonthOccurrences, getUpcomingBills, subscriptionSummary } from "@/server/queries/bills.query";
import { getComposerData } from "@/server/queries/composer.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Bills & subscriptions" };

const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined);

export default async function BillsPage(props: PageProps<"/bills">) {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const month = monthParam.parse((await props.searchParams).month) ?? today.slice(0, 7);
  const [bills, upcoming, monthOccurrences, data, prefs] = await Promise.all([
    getBills(user.id, today),
    getUpcomingBills(user.id, today),
    getMonthOccurrences(user.id, `${month}-01`, today),
    getComposerData(user.id, user.baseCurrency, user.timezone),
    getPreferences(user.id),
  ]);
  return (
    <PageContainer>
      <BillsView
        bills={bills}
        upcoming={upcoming}
        month={month}
        monthOccurrences={monthOccurrences}
        subscriptions={subscriptionSummary(bills, user.baseCurrency)}
        data={data}
        pref={prefs.numberFormat}
        weekStartsOn={prefs.weekStartsOn}
      />
    </PageContainer>
  );
}
