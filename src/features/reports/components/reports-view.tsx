"use client";

import { format, parseISO } from "date-fns";
import { ChevronDown, Download } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { PageHeader, SectionCard } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BreakdownDTO, ReportDTO } from "@/server/queries/reports.query";
import { reportQuery, type ReportPreset } from "../params";

const PRESET_LABELS: Record<ReportPreset, string> = {
  THIS_MONTH: "This month",
  LAST_MONTH: "Last month",
  LAST_3_MONTHS: "Last 3 months",
  LAST_6_MONTHS: "Last 6 months",
  THIS_YEAR: "This year",
  LAST_YEAR: "Last year",
  CUSTOM: "Custom range",
};

const range = (p: { start: string; end: string }) => `${format(parseISO(p.start), "d MMM yyyy")} – ${format(parseISO(p.end), "d MMM yyyy")}`;

/** Change with a direction word, never colour alone (D-020). Spending going up is shown as bad. */
function Change({ value, upIsGood }: { value: string | null; upIsGood: boolean }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const n = Number(value);
  if (Math.abs(n) < 0.05) return <span className="text-muted-foreground">no change</span>;
  const good = n > 0 === upIsGood;
  return (
    <span className={cn("tabular", good ? "text-positive" : "text-negative")}>
      {n > 0 ? "▲" : "▼"} {Math.abs(n).toFixed(1)}%
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs">{sub}</p>}
    </div>
  );
}

function BreakdownTable({ rows, fmt, upIsGood, empty }: { rows: BreakdownDTO[]; fmt: (v: string) => string; upIsGood: boolean; empty: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (rows.length === 0) return <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-5 py-2 font-medium">Category</th>
            <th className="px-3 py-2 text-right font-medium">This period</th>
            <th className="px-3 py-2 text-right font-medium">Share</th>
            <th className="px-3 py-2 text-right font-medium">Previous</th>
            <th className="px-5 py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((g) => {
            const expanded = open.has(g.id);
            return (
              <Fragment key={g.id}>
                <tr>
                  <td className="px-5 py-2">
                    {g.children.length > 0 ? (
                      <button
                        className="inline-flex items-center gap-1.5 font-medium hover:underline"
                        aria-expanded={expanded}
                        onClick={() => setOpen((s) => (s.has(g.id) ? new Set([...s].filter((x) => x !== g.id)) : new Set([...s, g.id])))}
                      >
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
                        {g.name}
                        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
                        {g.name}
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{fmt(g.amount)}</td>
                  <td className="tabular px-3 py-2 text-right text-muted-foreground">{g.sharePct === null ? "—" : `${g.sharePct}%`}</td>
                  <td className="tabular px-3 py-2 text-right text-muted-foreground">{fmt(g.previous)}</td>
                  <td className="px-5 py-2 text-right">
                    <Change value={g.changePct} upIsGood={upIsGood} />
                  </td>
                </tr>
                {expanded &&
                  g.children.map((c) => (
                    <tr key={c.id} className="bg-muted/30 text-xs">
                      <td className="py-1.5 pr-3 pl-10">{c.name}</td>
                      <td className="tabular px-3 py-1.5 text-right">{fmt(c.amount)}</td>
                      <td className="tabular px-3 py-1.5 text-right text-muted-foreground">{c.sharePct === null ? "—" : `${c.sharePct}%`}</td>
                      <td className="tabular px-3 py-1.5 text-right text-muted-foreground">{fmt(c.previous)}</td>
                      <td className="px-5 py-1.5 text-right">
                        <Change value={c.changePct} upIsGood={upIsGood} />
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PeriodPicker({ preset, period }: { preset: ReportPreset; period: { start: string; end: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<ReportPreset>(preset);
  const [from, setFrom] = useState(period.start);
  const [to, setTo] = useState(period.end);
  const go = (p: ReportPreset) => start(() => router.replace(`${pathname}?${reportQuery(p, { start: from, end: to })}`, { scroll: false }));

  return (
    <div className={cn("flex flex-wrap items-end gap-2", pending && "opacity-70")}>
      <Select
        value={value}
        onValueChange={(v) => {
          setValue(v as ReportPreset);
          if (v !== "CUSTOM") go(v as ReportPreset);
        }}
      >
        <SelectTrigger className="w-[170px]" aria-label="Report period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PRESET_LABELS) as ReportPreset[]).map((p) => (
            <SelectItem key={p} value={p}>
              {PRESET_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === "CUSTOM" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go("CUSTOM");
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="r-from" className="text-xs">
              From
            </Label>
            <Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="r-to" className="text-xs">
              To
            </Label>
            <Input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}

export function ReportsView({ data, preset, pref }: { data: ReportDTO; preset: ReportPreset; pref: NumberFormatPref }) {
  const fmt = (v: string) => formatMoney(v, data.baseCurrency, { pref, compactDecimals: true });
  const s = data.summary;
  const running = data.current.end !== data.period.end;

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        description={
          <>
            {range(data.current)}
            {running && " (so far)"} · compared with {range(data.previous)} · amounts in {data.baseCurrency}
          </>
        }
        actions={
          <>
            <PeriodPicker preset={preset} period={data.period} />
            <Button asChild variant="outline">
              <a href={`/reports/export?${reportQuery(preset, data.period)}`} download>
                <Download /> CSV
              </a>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Income" value={fmt(s.income)} sub={<Change value={s.incomeChangePct} upIsGood />} />
          <Stat label="Expenses" value={fmt(s.expenses)} sub={<Change value={s.expensesChangePct} upIsGood={false} />} />
          <Stat label="Net saved" value={<span className={cn(s.net.startsWith("-") && "text-negative")}>{fmt(s.net)}</span>} sub={<span className="text-muted-foreground">was {fmt(s.previousNet)}</span>} />
          <Stat label="Savings rate" value={s.savingsRate === null ? "N/A" : `${s.savingsRate}%`} sub={<span className="text-muted-foreground">Net saved ÷ income</span>} />
          <Stat label="Expense-to-income" value={s.expenseToIncome === null ? "N/A" : `${s.expenseToIncome}%`} sub={<span className="text-muted-foreground">Expenses ÷ income</span>} />
          <Stat label="Average daily spend" value={fmt(s.avgDailySpend)} sub={<span className="text-muted-foreground">Over the days reported</span>} />
        </div>

        <SectionCard title="Spending by category" description="Refunds reduce their category. Select a group to see its subcategories.">
          <BreakdownTable rows={data.spending} fmt={fmt} upIsGood={false} empty="No spending in this period." />
        </SectionCard>

        <SectionCard title="Income by category">
          <BreakdownTable rows={data.income} fmt={fmt} upIsGood empty="No income in this period." />
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Month by month">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 text-right font-medium">Income</th>
                    <th className="px-3 py-2 text-right font-medium">Expenses</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                    <th className="px-5 py-2 text-right font-medium">Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td className="px-5 py-2">{m.label}</td>
                      <td className="tabular px-3 py-2 text-right">{fmt(m.income)}</td>
                      <td className="tabular px-3 py-2 text-right">{fmt(m.expenses)}</td>
                      <td className={cn("tabular px-3 py-2 text-right", m.net.startsWith("-") && "text-negative")}>{fmt(m.net)}</td>
                      <td className="tabular px-5 py-2 text-right text-muted-foreground">{m.savingsRate === null ? "—" : `${m.savingsRate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Largest expenses">
            {data.topExpenses.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No expenses in this period.</p>
            ) : (
              <ol className="divide-y text-sm">
                {data.topExpenses.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">{format(parseISO(t.date), "d MMM")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{t.description || t.category}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.category} · {t.account}
                      </span>
                    </span>
                    <span className="tabular font-medium">{fmt(t.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Money in and out by account" description="Includes transfers between your accounts, so it shows movement, not income or spending.">
          {data.accounts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No account activity in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">In</th>
                    <th className="px-3 py-2 text-right font-medium">Out</th>
                    <th className="px-5 py-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.accounts.map((a) => (
                    <tr key={a.id}>
                      <td className="px-5 py-2">{a.name}</td>
                      <td className="tabular px-3 py-2 text-right">{fmt(a.moneyIn)}</td>
                      <td className="tabular px-3 py-2 text-right">{fmt(a.moneyOut)}</td>
                      <td className={cn("tabular px-5 py-2 text-right", a.net.startsWith("-") && "text-negative")}>{fmt(a.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <p className="text-xs text-muted-foreground">Calculated from your records; transfers never count as income or spending. Not financial advice.</p>
      </div>
    </>
  );
}
