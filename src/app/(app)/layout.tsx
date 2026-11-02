import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { COLLAPSE_COOKIE } from "@/components/layout/nav-config";
import { ComposerProvider } from "@/features/transactions/components/composer";
import { authMode, requireUser } from "@/server/auth";
import { getComposerData } from "@/server/queries/composer.query";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [user, cookieStore] = await Promise.all([requireUser(), cookies()]);
  const composerData = await getComposerData(user.id, user.baseCurrency, user.timezone);
  return (
    <ComposerProvider data={composerData}>
      <AppShell
        user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl, devMode: authMode() === "dev" }}
        initialCollapsed={cookieStore.get(COLLAPSE_COOKIE)?.value === "1"}
      >
        {children}
      </AppShell>
    </ComposerProvider>
  );
}
