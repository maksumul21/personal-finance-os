"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  Info,
  Lightbulb,
  PiggyBank,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { ExpenseDonut } from "@/components/charts/expense-donut";
import { TrendCharts } from "@/components/charts/trend-charts";
import { BudgetProgress, UsageBadge } from "@/components/finance/budget-progress";
import { Money } from "@/components/finance/money";
import { EmptyState, PageHeader, SectionCard } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InsightSeverity } from "@/domain/insights";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusLabel } from "@/features/bills/components/bill-status";
import { useComposer } from "@/features/transactions/components/composer";
import { TransactionRow } from "@/features/transactions/components/transaction-row";
import type { DashboardDTO } from "@/server/queries/dashboard.query";

const PERIODS: Record<string, string> = {
  THIS_MONTH: "This month",
  LAST_MONTH: "Last month",
  LAST_3_MONTHS: "Last 3 months",
  LAST_6_MONTHS: "Last 6 months",
  THIS_YEAR: "This year",
  LAST_YEAR: "Last year",
};

function useParamNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (next.toString() === params.toString()) return;
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { set, pending };
}

/**
 * % change vs the comparison period (display only). "none" when the comparison period had
 * nothing, so a percentage would be meaningless.
 */
function change(current: string, previous: string): number | "none" {
  const p = Number(previous);
  if (!(p > 0)) return Number(current) === 0 ? 0 : "none";
  return ((Number(current) - p) / p) * 100;
}

function Delta({ value, goodWhenUp, label }: { value: number | "none"; goodWhenUp: boolean; label: string }) {
  if (value === "none") return <span className="text-muted-foreground">Nothing in {label} to compare</span>;
  if (Math.abs(value) < 0.5) return <span className="text-muted-foreground">No change vs {label}</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-flex items-center font-medium", good ? "text-positive" : "text-negative")}>
        <Icon className="size-3.5" aria-hidden />
        {Math.abs(value).toFixed(0)}%
      </span>
      <span className="text-muted-foreground">vs {label}</span>
    </span>
  );
}

function Kpi({
  label,
  icon: Icon,
  children,
  footer,
}: {
  label: string;
  icon: typeof Wallet;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{children}</div>
      {footer && <p className="mt-1 text-xs">{footer}</p>}
    </div>
  );
}

const SEVERITY: Record<InsightSeverity, { icon: typeof Info; cls: string; dismissible: boolean }> = {
  critical: { icon: CircleAlert, cls: "text-negative", dismissible: false },
  warning: { icon: TrendingUp, cls: "text-warning", dismissible: true },
  positive: { icon: TrendingDown, cls: "text-positive", dismissible: true },
  info: { icon: Lightbulb, cls: "text-primary", dismissible: true },
};

const DISMISS_KEY = "pfos.dismissedInsights";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function Insights({ data }: { data: DashboardDTO }) {
  const raw = useSyncExternalStore(subscribe, readDismissed, () => "[]");
  const [local, setLocal] = useState<string[]>([]);
  const dismissed = new Set<string>([...(JSON.parse(raw) as string[]), ...local]);
  // A dismissal applies to this period only; the same insight can return next period.
  const id = (key: string) => `${data.period.start}:${key}`;
  const visible = data.insights.filter((i) => !dismissed.has(id(i.key)));

  const dismiss = (key: string) => {
    const next = [...dismissed, id(key)].slice(-200);
    setLocal((l) => [...l, id(key)]);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the dismissal lasts for this visit only.
    }
  };

  return (
    <SectionCard title="Insights" description="Calculated from your records. Not financial advice.">
      {visible.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {data.insights.length === 0
            ? "Insights appear once there's enough activity to compare."
            : "You've dismissed all insights for this period."}
        </p>
      ) : (
        <ul className="divide-y">
          {visible.map((i) => {
            const meta = SEVERITY[i.severity];
            const Icon = meta.icon;
            return (
              <li key={i.key} className="flex gap-3 px-5 py-3.5">
                <Icon className={cn("mt-0.5 size-4 shrink-0", meta.cls)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{i.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{i.basis}</p>
                </div>
                {meta.dismissible && (
                  <Button variant="ghost" size="icon-xs" aria-label="Dismiss insight" onClick={() => dismiss(i.key)}>
                    <X />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export function DashboardView({
  data,
  pref,
  greeting,
  preset,
  months,
  today,
}: {
  data: DashboardDTO;
  pref: NumberFormatPref;
  greeting: string;
  preset: string;
  months: number;
  today: string;
}) {
  const composer = useComposer();
  const { set, pending } = useParamNav();
  const k = data.kpis;
  const c = data.baseCurrency;
  const cmp = k.comparisonLabel;
  const budgetLines = (data.budget?.lines ?? [])
    .filter((l) => l.kind === "EXPENSE_CATEGORY")
    .sort((a, b) => Number(b.usagePct ?? 0) - Number(a.usagePct ?? 0))
    .slice(0, 6);
  const empty = data.recent.length === 0;

  return (
    <div className={cn("transition-opacity", pending && "opacity-70")}>
      <PageHeader
        title={greeting}
        description={`${data.periodLabel} · amounts in ${c}`}
        actions={
          <>
            <Select value={preset} onValueChange={(v) => set({ period: v === "default" ? undefined : v })}>
              <SelectTrigger className="w-[160px]" aria-label="Dashboard period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERIODS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => composer.open()}>
              <Plus /> Add transaction
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total balance" icon={Wallet} footer={<span className="text-muted-foreground">Active asset accounts</span>}>
          <Money value={k.totalBalance} currency={c} pref={pref} tone="auto" compactDecimals />
        </Kpi>
        <Kpi label="Income" icon={ArrowDownRight} footer={<Delta value={change(k.income, k.previousIncome)} goodWhenUp label={cmp} />}>
          <Money value={k.income} currency={c} pref={pref} compactDecimals />
        </Kpi>
        <Kpi label="Expenses" icon={ArrowUpRight} footer={<Delta value={change(k.expenses, k.previousExpenses)} goodWhenUp={false} label={cmp} />}>
          <Money value={k.expenses} currency={c} pref={pref} compactDecimals />
        </Kpi>
        <Kpi
          label="Savings"
          icon={PiggyBank}
          footer={
            <span className="text-muted-foreground">
              Savings rate <span className="tabular font-medium text-foreground">{k.savingsRate === null ? "N/A" : `${k.savingsRate}%`}</span>
            </span>
          }
        >
          <Money value={k.savings} currency={c} pref={pref} tone="auto" compactDecimals />
        </Kpi>
        <Kpi
          label="Net worth"
          icon={Scale}
          footer={
            <span className="text-muted-foreground">
              {k.unconvertedCount > 0 ? `${k.unconvertedCount} account(s) need a rate` : "Accounts, investments and other assets − debts"}
            </span>
          }
        >
          <Money value={k.netWorth} currency={c} pref={pref} tone="auto" compactDecimals />
        </Kpi>
        <Kpi
          label="Remaining budget"
          icon={WalletCards}
          footer={
            data.budget ? (
              <Link href={`/budgets/${data.budget.id}`} className="text-primary hover:underline">
                {data.budget.name}
              </Link>
            ) : (
              <Link href="/budgets" className="text-primary hover:underline">
                Create a budget
              </Link>
            )
          }
        >
          {k.remainingBudget === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Money value={k.remainingBudget} currency={c} pref={pref} tone="auto" compactDecimals />
          )}
        </Kpi>
      </div>

      {empty ? (
        <EmptyState
          className="mt-6"
          icon={Plus}
          title="Record your first transaction"
          description="Charts, budgets and insights fill in from your real income, expenses and transfers. Nothing here is sample data."
          action={
            <Button onClick={() => composer.open()}>
              <Plus /> Add transaction
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-6">
            <TrendCharts
              data={data.months}
              currency={c}
              pref={pref}
              rangeControl={
                <Select value={String(months)} onValueChange={(v) => set({ months: v === "6" ? undefined : v })}>
                  <SelectTrigger size="sm" className="w-[130px]" aria-label="Months shown">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Last 6 months</SelectItem>
                    <SelectItem value="12">Last 12 months</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SectionCard title="Where the money went" description={`Expenses by category · ${data.periodLabel}`}>
              <div className="p-5">
                {data.breakdown.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No expenses in this period.</p>
                ) : (
                  <ExpenseDonut slices={data.breakdown} total={k.expenses} currency={c} pref={pref} />
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Budget utilization"
              description={data.budget ? `${data.budget.name} · most used first` : "No budget covers today"}
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link href={data.budget ? `/budgets/${data.budget.id}` : "/budgets"}>{data.budget ? "Open" : "Create"}</Link>
                </Button>
              }
            >
              {budgetLines.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  {data.budget ? "This budget has no category limits yet." : "Plan your spending to track it here."}
                </p>
              ) : (
                <ul className="space-y-4 p-5">
                  {budgetLines.map((l) => (
                    <li key={l.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{l.name}</span>
                        <UsageBadge state={l.state!} usagePct={l.usagePct} />
                      </div>
                      <BudgetProgress usagePct={l.usagePct} state={l.state!} label={`${l.name} budget`} />
                      <p className="tabular mt-1 text-xs text-muted-foreground">
                        {formatMoney(l.spent!, c, { pref, compactDecimals: true })} of {formatMoney(l.available, c, { pref, compactDecimals: true })} ·{" "}
                        {Number(l.remaining) >= 0
                          ? `${formatMoney(l.remaining!, c, { pref, compactDecimals: true })} left`
                          : `${formatMoney(l.remaining!.replace("-", ""), c, { pref, compactDecimals: true })} over`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <SectionCard
          title="Recent transactions"
          className="lg:col-span-3"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/transactions">View all</Link>
            </Button>
          }
        >
          {empty ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {data.recent.map((t) => (
                <TransactionRow
                  key={t.id}
                  t={t}
                  pref={pref}
                  showDate
                  dateLabel={t.date === today ? "Today" : new Date(`${t.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                />
              ))}
            </ul>
          )}
        </SectionCard>
        <div className="space-y-6 lg:col-span-2">
          <Insights data={data} />
          <SectionCard
            title="Upcoming bills"
            description={data.upcomingBills.items.length ? "Overdue and due in the next 30 days" : undefined}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/bills">View all</Link>
              </Button>
            }
          >
            {data.upcomingBills.items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Nothing due in the next 30 days.</p>
            ) : (
              <ul className="divide-y">
                {data.upcomingBills.items.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        {new Date(`${b.dueDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        <StatusLabel status={b.status} />
                      </p>
                    </div>
                    <span className="tabular text-sm font-semibold">{formatMoney(b.amount, b.currency, { pref, compactDecimals: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
