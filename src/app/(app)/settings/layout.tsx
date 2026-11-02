import { PageContainer, PageHeader } from "@/components/layout/page";
import { SettingsTabs } from "@/features/settings/components/settings-tabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Settings" description="Your profile, preferences and categories." />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </PageContainer>
  );
}
