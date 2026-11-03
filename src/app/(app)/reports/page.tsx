import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { ReportsView } from "@/features/reports/components/reports-view";
import { reportParamsSchema, resolveReportPeriod } from "@/features/reports/params";
import { requireUser } from "@/server/auth";
import { getReport } from "@/server/queries/reports.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Reports & analytics" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const { preset, period } = resolveReportPeriod(reportParamsSchema.parse(await props.searchParams), today);
  const [data, prefs] = await Promise.all([getReport(user.id, user.baseCurrency, period, today), getPreferences(user.id)]);
  return (
    <PageContainer>
      <ReportsView key={`${period.start}-${period.end}`} data={data} preset={preset} pref={prefs.numberFormat} />
    </PageContainer>
  );
}
