"use client";

import { format, parseISO } from "date-fns";
import { CalendarClock, LineChart as LineIcon, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "@/components/finance/kpi-card";
import { PageHeader, SectionCard } from "@/components/layout/page";
import { formatAxisMoney, formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FORECAST_HORIZONS } from "@/domain/forecast";
import type { ForecastDTO } from "@/server/queries/forecast.query";

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const KIND_LABEL = { BILL: "Bill", RECURRING: "Scheduled expense", TRANSFER: "Transfer", EMI: "Loan EMI", INCOME: "Income" } as const;
const day = (d: string) => format(parseISO(d), "d MMM yyyy");

function href(horizon: number, dayToDay: boolean) {
  const p = new URLSearchParams();
  if (horizon !== 90) p.set("days", String(horizon));
  if (!dayToDay) p.set("daily", "off");
  const q = p.toString();
  return q ? `/forecast?${q}` : "/forecast";
}

export function ForecastView({ data, currency, pref }: { data: ForecastDTO; currency: string; pref: NumberFormatPref }) {
  const [asTable, setAsTable] = useState(false);
  const fmt = (v: string) => formatMoney(v, currency, { pref, compactDecimals: true });
  // Numbers are for plotting only; labels use the exact decimal strings.
  const plot = data.points.map((p) => ({ ...p, label: format(parseISO(p.date), "d MMM"), _v: Number(p.balance) }));
  const negative = data.firstNegative !== null;

  return (
    <>
      <PageHeader
        title="Cash-flow forecast"
        description="Where your cash, bank and wallet balances are heading, from what's scheduled and how you usually spend. An estimate from your records, not financial advice."
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div role="group" aria-label="Forecast length" className="flex rounded-lg border p-0.5">
            {FORECAST_HORIZONS.map((h) => (
              <Link
                key={h}
                href={href(h, data.includeDayToDay)}
                scroll={false}
                aria-current={h === data.horizon ? "true" : undefined}
                className={cn("rounded-md px-3 py-1.5 font-medium", h === data.horizon ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {h} days
              </Link>
            ))}
          </div>
          <Link
            href={href(data.horizon, !data.includeDayToDay)}
            scroll={false}
            role="switch"
            aria-checked={data.includeDayToDay}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-muted-foreground hover:text-foreground"
          >
            <span className={cn("inline-block h-4 w-7 rounded-full p-0.5 transition-colors", data.includeDayToDay ? "bg-primary" : "bg-muted")}>
              <span className={cn("block size-3 rounded-full bg-background transition-transform", data.includeDayToDay && "translate-x-3")} />
            </span>
            Include day-to-day spending ({fmt(data.dailySpend)}/day)
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard label="Today" icon={Wallet} value={fmt(data.start)} hint="Cash, bank and wallet accounts" />
          <KpiCard
            label="Lowest point"
            icon={LineIcon}
            value={<span className={cn(data.lowest.balance.startsWith("-") && "text-negative")}>{fmt(data.lowest.balance)}</span>}
            hint={`on ${day(data.lowest.date)}`}
          />
          <KpiCard label={`In ${data.horizon} days`} icon={CalendarClock} value={fmt(data.endBalance)} hint={`on ${day(data.end)}`} />
          <KpiCard
            label="Runs short"
            icon={TriangleAlert}
            value={<span className={cn(negative && "text-negative")}>{negative ? day(data.firstNegative!) : "No"}</span>}
            hint={negative ? "First day below zero" : "Stays above zero throughout"}
          />
        </div>

        <SectionCard
          title="Projected balance"
          description={`Scheduled in ${fmt(data.scheduledIn)} · scheduled out ${fmt(data.scheduledOut)}${data.includeDayToDay ? ` · day-to-day ${fmt(data.dayToDay)}` : ""}`}
          actions={
            <button
              onClick={() => setAsTable((t) => !t)}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-pressed={asTable}
            >
              {asTable ? "Chart" : "Table"}
            </button>
          }
        >
          <div className="p-5">
            {asTable ? (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Day</th>
                      <th className="pb-2 text-right font-medium">End-of-day balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.points.map((p) => (
                      <tr key={p.date}>
                        <td className="py-1.5">{day(p.date)}</td>
                        <td className={cn("tabular py-1.5 text-right", p.balance.startsWith("-") && "text-negative")}>{formatMoney(p.balance, currency, { pref })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-72" role="img" aria-label={`Projected balance over ${data.horizon} days. Use the Table button for values.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={plot} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tickFormatter={(v: number) => formatAxisMoney(v, currency, pref)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} />
                    <ReferenceLine y={0} stroke="var(--negative)" strokeDasharray="4 4" />
                    <Tooltip
                      cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        const p = active && payload?.[0]?.payload;
                        if (!p) return null;
                        return (
                          <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                            <p className="font-medium">{day(p.date)}</p>
                            <p className="tabular">{formatMoney(p.balance, currency, { pref })}</p>
                          </div>
                        );
                      }}
                    />
                    <Line dataKey="_v" name="Balance" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Scheduled money in and out" description="Overdue items are counted today. Credit-card bills count when you pay the card.">
          {data.flows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              Nothing scheduled. Add <Link href="/transactions/recurring" className="text-primary hover:underline">recurring transactions</Link>,{" "}
              <Link href="/bills" className="text-primary hover:underline">bills</Link> or <Link href="/debts" className="text-primary hover:underline">loan details</Link> to see them here.
            </p>
          ) : (
            <ul className="divide-y">
              {data.flows.map((f, i) => (
                <li key={`${f.date}-${f.title}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-5 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {format(parseISO(f.date), "d MMM")}
                    {f.date < data.today && <span className="ml-1 text-negative">overdue</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{f.title}</span>
                    <span className="text-xs text-muted-foreground">{KIND_LABEL[f.kind]}</span>
                  </span>
                  <span className={cn("tabular w-28 text-right font-medium", f.amount.startsWith("-") ? "" : "text-positive")}>
                    {f.amount.startsWith("-") ? `−${fmt(f.amount.slice(1))}` : `+${fmt(f.amount)}`}
                  </span>
                  <span className={cn("tabular w-28 text-right text-xs text-muted-foreground", f.balanceAfter.startsWith("-") && "text-negative")}>
                    {fmt(f.balanceAfter)} after
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <p className="text-xs text-muted-foreground">
          Day-to-day spending is the average of expenses not created by bills, schedules or loans over the last {data.spendBasisDays} day{data.spendBasisDays === 1 ? "" : "s"}
          {data.spendBasisDays < 30 ? " (little history yet, so treat it as rough)" : ""}. Income you haven&apos;t scheduled isn&apos;t included.
          {data.unconvertedCount > 0 && ` ${data.unconvertedCount} item(s) left out for lack of an exchange rate.`}
        </p>
      </div>
    </>
  );
}
