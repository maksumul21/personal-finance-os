import { ArrowLeftRight, CreditCard, Landmark, Plus, Wallet, WalletCards } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FinanceIcon } from "@/components/finance/finance-icon";
import { KpiCard } from "@/components/finance/kpi-card";
import { Money } from "@/components/finance/money";
import { EmptyState, PageContainer, PageHeader, SectionCard } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { getAccountsOverview } from "@/server/queries/accounts.query";
import { getPreferences } from "@/server/queries/settings.query";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [overview, prefs] = await Promise.all([getAccountsOverview(user.id, user.baseCurrency), getPreferences(user.id)]);
  const active = overview.accounts.filter((a) => !a.isArchived);
  const firstName = user.name?.split(" ")[0];

  return (
    <PageContainer>
      <PageHeader
        title={`${greeting(user.timezone)}${firstName ? `, ${firstName}` : ""}`}
        description="Here’s where your money stands."
        actions={
          <Button asChild variant="outline">
            <Link href="/accounts">
              <Plus /> Add account
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Total balance"
          icon={Wallet}
          value={<Money value={overview.totals.totalBalance} currency={user.baseCurrency} pref={prefs.numberFormat} tone="auto" />}
          hint="Sum of active asset accounts. Excludes cards and loans."
        />
        <KpiCard
          label="Owed on cards & loans"
          icon={CreditCard}
          value={<Money value={overview.totals.totalLiabilities} currency={user.baseCurrency} pref={prefs.numberFormat} />}
          hint="Outstanding liability on active accounts."
        />
        <KpiCard
          label="Active accounts"
          icon={Landmark}
          value={<span className="tabular">{active.length}</span>}
          hint={
            overview.totals.unconvertedCount > 0
              ? `${overview.totals.unconvertedCount} in another currency, not in totals.`
              : "Archived accounts are not counted."
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <SectionCard
          title="Accounts"
          className="lg:col-span-3"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/accounts">View all</Link>
            </Button>
          }
        >
          {active.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Wallet}
                title="Add your first account"
                description="Start with cash, a bank account or bKash to see your balance here."
                action={
                  <Button asChild>
                    <Link href="/accounts">Add account</Link>
                  </Button>
                }
                className="border-none py-6"
              />
            </div>
          ) : (
            <ul className="divide-y">
              {active.slice(0, 6).map((a) => {
                const owed = a.nature === "LIABILITY" && a.balance.startsWith("-");
                return (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <FinanceIcon name={a.icon} color={a.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                    <span className="text-right text-sm font-medium">
                      <Money
                        value={owed ? a.balance.slice(1) : a.balance}
                        currency={a.currency}
                        pref={prefs.numberFormat}
                        tone={a.nature === "LIABILITY" ? "neutral" : "auto"}
                      />
                      {owed && <span className="ml-1 text-xs font-normal text-muted-foreground">owed</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Coming next" description="Unlocks as the next modules ship." className="lg:col-span-2">
          <ul className="divide-y text-sm">
            {[
              { icon: ArrowLeftRight, title: "Transactions", text: "Record income, expenses and transfers." },
              { icon: WalletCards, title: "Budgets", text: "Plan monthly spending by category." },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 px-5 py-3.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            Income, expense and savings cards appear once transactions are available, calculated from real records only.
          </p>
        </SectionCard>
      </div>
    </PageContainer>
  );
}
