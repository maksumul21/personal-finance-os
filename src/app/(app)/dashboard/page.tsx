import type { Metadata } from "next";
import { z } from "zod";
import { PageContainer } from "@/components/layout/page";
import { PERIOD_PRESETS, resolvePreset, todayIn } from "@/domain/period";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import { requireUser } from "@/server/auth";
import { getDashboard } from "@/server/queries/dashboard.query";
import { getSafeToSpend } from "@/server/queries/safe-to-spend.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Dashboard" };

const paramsSchema = z.object({
  period: z.enum(PERIOD_PRESETS).optional().catch(undefined),
  months: z.enum(["6", "12"]).default("6").catch("6"),
});

function greeting(timeZone: string, name: string | null) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(new Date()));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name?.split(" ")[0];
  return first ? `${part}, ${first}` : part;
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requireUser();
  const prefs = await getPreferences(user.id);
  const params = paramsSchema.parse(await props.searchParams);
  const preset = params.period ?? prefs.dashboardPeriod;
  const today = todayIn(user.timezone);

  const [data, safeToSpend] = await Promise.all([
    getDashboard({
      userId: user.id,
      baseCurrency: user.baseCurrency,
      today,
      period: resolvePreset(preset, today),
      trendMonths: Number(params.months),
      thresholds: { warnPct: prefs.budgetWarnPct, criticalPct: prefs.budgetCriticalPct },
      pref: prefs.numberFormat,
    }),
    getSafeToSpend(user.id, user.baseCurrency, today),
  ]);

  return (
    <PageContainer>
      <DashboardView
        data={data}
        safeToSpend={safeToSpend}
        pref={prefs.numberFormat}
        greeting={greeting(user.timezone, user.name)}
        preset={preset}
        months={Number(params.months)}
        today={today}
      />
    </PageContainer>
  );
}
