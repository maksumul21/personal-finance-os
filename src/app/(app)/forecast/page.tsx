import type { Metadata } from "next";
import { z } from "zod";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { ForecastView } from "@/features/forecast/components/forecast-view";
import { requireUser } from "@/server/auth";
import { getForecast } from "@/server/queries/forecast.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Cash-flow forecast" };

const paramsSchema = z.object({
  days: z.enum(["30", "90", "180"]).default("90").catch("90"),
  daily: z.enum(["on", "off"]).default("on").catch("on"),
});

export default async function ForecastPage(props: PageProps<"/forecast">) {
  const user = await requireUser();
  const params = paramsSchema.parse(await props.searchParams);
  const today = todayIn(user.timezone);
  const [data, prefs] = await Promise.all([
    getForecast(user.id, user.baseCurrency, today, Number(params.days) as 30 | 90 | 180, params.daily === "on"),
    getPreferences(user.id),
  ]);
  return (
    <PageContainer>
      <ForecastView data={data} currency={user.baseCurrency} pref={prefs.numberFormat} />
    </PageContainer>
  );
}
