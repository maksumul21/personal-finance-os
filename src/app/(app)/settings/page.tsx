import type { Metadata } from "next";
import { SettingsForms } from "@/features/settings/components/settings-forms";
import { requireUser } from "@/server/auth";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const prefs = await getPreferences(user.id);
  return <SettingsForms prefs={prefs} timezones={Intl.supportedValuesOf("timeZone")} />;
}
