import type { Metadata } from "next";
import { z } from "zod";
import { PageContainer } from "@/components/layout/page";
import { todayIn } from "@/domain/period";
import { CalendarView } from "@/features/calendar/components/calendar-view";
import { requireUser } from "@/server/auth";
import { getCalendar } from "@/server/queries/calendar.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Financial calendar" };

const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined);

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const user = await requireUser();
  const today = todayIn(user.timezone);
  const month = monthParam.parse((await props.searchParams).month) ?? today.slice(0, 7);
  const prefs = await getPreferences(user.id);
  const data = await getCalendar(user.id, user.baseCurrency, month, today, prefs.weekStartsOn);
  return (
    <PageContainer>
      <CalendarView key={month} data={data} pref={prefs.numberFormat} />
    </PageContainer>
  );
}
