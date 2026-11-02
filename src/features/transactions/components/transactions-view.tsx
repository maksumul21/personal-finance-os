"use client";

import { format, parseISO } from "date-fns";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Money } from "@/components/finance/money";
import { EmptyState, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_PRESETS, resolvePreset, type PeriodPreset } from "@/domain/period";
import type { NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComposerData } from "@/server/queries/composer.query";
import type { TransactionPage } from "@/server/queries/transactions.query";
import type { TransactionFilters } from "../schemas";
import { useComposer } from "./composer";
import { TransactionRow } from "./transaction-row";
import { TransactionsTabs } from "./transactions-tabs";

const ALL = "__all__";
const PRESET_LABELS: Record<PeriodPreset, string> = {
  THIS_MONTH: "This month",
  LAST_MONTH: "Last month",
  LAST_3_MONTHS: "Last 3 months",
  LAST_6_MONTHS: "Last 6 months",
  THIS_YEAR: "This year",
  LAST_YEAR: "Last year",
};

function dayHeading(day: string, today: string) {
  if (day === today) return "Today";
  const d = parseISO(day);
  const y = parseISO(today);
  if (format(new Date(y.getFullYear(), y.getMonth(), y.getDate() - 1), "yyyy-MM-dd") === day) return "Yesterday";
  return format(d, d.getFullYear() === y.getFullYear() ? "EEE, d MMM" : "EEE, d MMM yyyy");
}

function useFilterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    // Navigating to the same URL would re-render and could loop, so skip no-op changes.
    if (next.toString() === params.toString()) return;
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { set, pending, params };
}

function FilterBar({ filters, data }: { filters: TransactionFilters; data: ComposerData }) {
  const { set, pending, params } = useFilterNav();
  const [q, setQ] = useState(filters.q ?? "");

  // Debounced search; skip when the box already matches the URL.
  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const id = setTimeout(() => set({ q: q.trim() || undefined }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const presetValue =
    PERIOD_PRESETS.find((p) => {
      const r = resolvePreset(p, data.today);
      return r.start === filters.from && r.end === filters.to;
    }) ?? (filters.from || filters.to ? "CUSTOM" : ALL);

  const groups = data.categories.filter((c) => c.group === null);
  const active = params.size > 0 && [...params.keys()].some((k) => k !== "page" && k !== "sort");

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-70")}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description, notes, category or tag"
            className="pl-9"
            aria-label="Search transactions"
          />
        </div>
        <Select value={filters.sort} onValueChange={(v) => set({ sort: v === "date_desc" ? undefined : v })}>
          <SelectTrigger className="w-[150px] shrink-0" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Newest first</SelectItem>
            <SelectItem value="date_asc">Oldest first</SelectItem>
            <SelectItem value="amount_desc">Largest amount</SelectItem>
            <SelectItem value="amount_asc">Smallest amount</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select
          value={presetValue}
          onValueChange={(v) => {
            if (v === ALL) set({ from: undefined, to: undefined });
            else if (v !== "CUSTOM") {
              const r = resolvePreset(v as PeriodPreset, data.today);
              set({ from: r.start, to: r.end });
            }
          }}
        >
          <SelectTrigger className="w-full" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All time</SelectItem>
            {PERIOD_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {PRESET_LABELS[p]}
              </SelectItem>
            ))}
            {presetValue === "CUSTOM" && <SelectItem value="CUSTOM">Custom range</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={filters.type ?? ALL} onValueChange={(v) => set({ type: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="EXPENSE">Expenses</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="TRANSFER">Transfers</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.account ?? ALL} onValueChange={(v) => set({ account: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full" aria-label="Account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>All accounts</SelectItem>
            {data.accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
                {a.isArchived ? " (archived)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.category ?? ALL} onValueChange={(v) => set({ category: v === ALL ? undefined : v })}>
          <SelectTrigger className="w-full" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={ALL}>All categories</SelectItem>
            {(["EXPENSE", "INCOME"] as const).map((kind) => (
              <SelectGroup key={kind}>
                <SelectLabel>{kind === "EXPENSE" ? "Expenses" : "Income"}</SelectLabel>
                {groups
                  .filter((g) => g.kind === kind)
                  .flatMap((g) => [g, ...data.categories.filter((c) => c.group === g.name && c.kind === kind)])
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id} className={c.group ? "pl-5" : undefined}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2 text-muted-foreground">
          From
          <Input type="date" value={filters.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} className="h-8 w-[150px]" />
        </label>
        <label className="flex items-center gap-2 text-muted-foreground">
          To
          <Input type="date" value={filters.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} className="h-8 w-[150px]" />
        </label>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              set({ q: undefined, type: undefined, account: undefined, category: undefined, from: undefined, to: undefined });
            }}
          >
            <X /> Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

export function TransactionsView({
  page,
  filters,
  data,
  pref,
}: {
  page: TransactionPage;
  filters: TransactionFilters;
  data: ComposerData;
  pref: NumberFormatPref;
}) {
  const composer = useComposer();
  const { set } = useFilterNav();
  const base = data.baseCurrency;
  const filtered = Boolean(filters.q || filters.type || filters.account || filters.category || filters.from || filters.to);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Income, expenses and transfers. Transfers move money between your accounts and never count as income or spending."
        actions={
          <Button onClick={() => composer.open({ accountId: filters.account })}>
            <Plus /> Add transaction
          </Button>
        }
      />

      <TransactionsTabs />

      <FilterBar key={JSON.stringify({ ...filters, page: 0 })} filters={filters} data={data} />

      <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
        {[
          { label: "Income", value: page.summary.income, tone: "positive" as const },
          { label: "Expenses", value: page.summary.expenses, tone: "neutral" as const },
          { label: "Net", value: page.summary.net, tone: "auto" as const },
        ].map((s) => (
          <div key={s.label} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <Money value={s.value} currency={base} pref={pref} tone={s.tone} signed={s.label === "Net"} className="mt-0.5 block text-base font-semibold sm:text-lg" />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {page.summary.count} transaction{page.summary.count === 1 ? "" : "s"}
        {filtered ? " match these filters" : ""}. Totals in {base}; transfers excluded.
      </p>

      <div className="mt-5 space-y-4">
        {page.groups.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title={filtered ? "No matching transactions" : "No transactions yet"}
            description={
              filtered ? "Try a different period or clear the filters." : "Record your first income, expense or transfer to see it here."
            }
            action={
              filtered ? undefined : (
                <Button onClick={() => composer.open()}>
                  <Plus /> Add transaction
                </Button>
              )
            }
          />
        ) : (
          page.groups.map((g) => (
            <section key={g.date} className="overflow-hidden rounded-xl border bg-card">
              <header className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 sm:px-5">
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{dayHeading(g.date, data.today)}</h2>
                <p className="tabular text-xs text-muted-foreground">
                  {g.income !== "0.00" && (
                    <span className="mr-3">
                      In <Money value={g.income} currency={base} pref={pref} className="text-positive" />
                    </span>
                  )}
                  {g.expenses !== "0.00" && (
                    <span>
                      Out <Money value={g.expenses} currency={base} pref={pref} />
                    </span>
                  )}
                </p>
              </header>
              <ul className="divide-y">
                {g.transactions.map((t) => (
                  <TransactionRow key={t.id} t={t} pref={pref} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {page.pageCount > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page.page <= 1} onClick={() => set({ page: String(page.page - 1) })}>
            <ChevronLeft /> Newer
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page.page} of {page.pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page.page >= page.pageCount} onClick={() => set({ page: String(page.page + 1) })}>
            Older <ChevronRight />
          </Button>
        </nav>
      )}

      {filters.account && (
        <p className="mt-6 text-center text-sm">
          <Link href="/accounts" className="text-primary hover:underline">
            Back to accounts
          </Link>
        </p>
      )}
    </>
  );
}
