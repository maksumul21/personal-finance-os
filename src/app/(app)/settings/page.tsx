import type { Metadata } from "next";
import { todayIn } from "@/domain/period";
import { ExchangeRates } from "@/features/settings/components/exchange-rates";
import { SettingsForms } from "@/features/settings/components/settings-forms";
import { requireUser } from "@/server/auth";
import { getPreferences } from "@/server/queries/settings.query";
import { getExchangeRates } from "@/server/queries/transactions.query";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [prefs, rates] = await Promise.all([getPreferences(user.id), getExchangeRates(user.id)]);
  return (
    <div className="space-y-6">
      <SettingsForms prefs={prefs} timezones={Intl.supportedValuesOf("timeZone")} />
      <ExchangeRates rates={rates} baseCurrency={user.baseCurrency} today={todayIn(user.timezone)} />
    </div>
  );
}
