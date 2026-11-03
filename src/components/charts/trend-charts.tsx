"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatAxisMoney, formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MonthPoint } from "@/server/queries/dashboard.query";

/**
 * Trend charts for the dashboard (PRD §4.2). Colours come from the validated categorical slots
 * (--chart-n); text always uses text tokens. One y-axis per chart; every chart has a table view.
 */

type View = "income" | "cashflow" | "savings" | "networth";

interface SeriesDef {
  key: keyof MonthPoint;
  label: string;
  color: string;
}

const VIEWS: Record<View, { label: string; series: SeriesDef[]; note: string }> = {
  income: {
    label: "Income vs expenses",
    series: [
      { key: "income", label: "Income", color: "var(--chart-1)" },
      { key: "expenses", label: "Expenses", color: "var(--chart-2)" },
    ],
    note: "Transfers between your accounts are excluded.",
  },
  cashflow: {
    label: "Cash flow",
    series: [{ key: "net", label: "Net cash flow", color: "var(--chart-1)" }],
    note: "Income minus expenses each month. Below zero means you spent more than you earned.",
  },
  savings: {
    label: "Savings",
    series: [
      { key: "net", label: "Saved this month", color: "var(--chart-1)" },
      { key: "cumulativeSavings", label: "Cumulative", color: "var(--chart-7)" },
    ],
    note: "Savings = income − expenses, not money moved into savings accounts. Cumulative starts at the first month shown.",
  },
  networth: {
    label: "Net worth",
    series: [{ key: "netWorth", label: "Net worth", color: "var(--chart-1)" }],
    note: "Month-end assets minus liabilities from your accounts. Investments and other assets are added in a later phase.",
  },
};

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

function ChartTooltip({
  active,
  payload,
  label,
  series,
  currency,
  pref,
}: TooltipContentProps & { series: SeriesDef[]; currency: string; pref: NumberFormatPref }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as MonthPoint;
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>
      {series.map((s) => {
        const v = point[s.key] as string | null;
        return (
          <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular font-medium text-popover-foreground">
              {v === null ? "N/A" : formatMoney(v, currency, { pref })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Legend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-3 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ data, series, currency, pref }: { data: MonthPoint[]; series: SeriesDef[]; currency: string; pref: NumberFormatPref }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
          <tr>
            <th className="py-2 text-left font-medium">Month</th>
            {series.map((s) => (
              <th key={s.key} className="py-2 text-right font-medium">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...data].reverse().map((d) => (
            <tr key={d.month}>
              <td className="py-2">{d.label}</td>
              {series.map((s) => {
                const v = d[s.key] as string | null;
                return (
                  <td key={s.key} className="tabular py-2 text-right">
                    {v === null ? "N/A" : formatMoney(v, currency, { pref })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrendCharts({
  data,
  currency,
  pref,
  rangeControl,
}: {
  data: MonthPoint[];
  currency: string;
  pref: NumberFormatPref;
  rangeControl: React.ReactNode;
}) {
  const [view, setView] = useState<View>("income");
  const [asTable, setAsTable] = useState(false);
  const def = VIEWS[view];
  // Numbers are for plotting only; tooltips and the table use the exact decimal strings.
  const plot = data.map((d) => ({
    ...d,
    _income: Number(d.income),
    _expenses: Number(d.expenses),
    _net: Number(d.net),
    _cumulativeSavings: Number(d.cumulativeSavings),
    _netWorth: d.netWorth === null ? null : Number(d.netWorth),
  }));
  const hasData = data.some((d) => d.income !== "0.00" || d.expenses !== "0.00");
  const tooltip = (props: TooltipContentProps) => (
    <ChartTooltip {...props} series={def.series} currency={currency} pref={pref} />
  );
  const yAxis = (
    <YAxis
      tickFormatter={(v: number) => formatAxisMoney(v, currency, pref)}
      tick={AXIS_TICK}
      axisLine={false}
      tickLine={false}
      width={64}
    />
  );
  const common = { data: plot, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" />;
  const xAxis = <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />;
  const cursor = { fill: "var(--muted)", opacity: 0.5 };

  return (
    <section className="rounded-2xl border bg-card shadow-card">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Trend" className="-mx-1 flex gap-1 overflow-x-auto">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                view === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEWS[v].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {rangeControl}
          <button
            onClick={() => setAsTable((t) => !t)}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-pressed={asTable}
          >
            {asTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>
      <div className="px-5 pt-4 pb-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Legend series={def.series} />
        </div>
        {!hasData && view !== "networth" ? (
          <p className="grid h-64 place-items-center text-sm text-muted-foreground">No income or expenses in these months yet.</p>
        ) : asTable ? (
          <DataTable data={data} series={def.series} currency={currency} pref={pref} />
        ) : (
          <div className="h-64" role="img" aria-label={`${def.label} chart, ${data.length} months. Use the Table button for values.`}>
            <ResponsiveContainer width="100%" height="100%">
              {view === "income" ? (
                <BarChart {...common} barGap={2} barCategoryGap="28%">
                  {grid}
                  {xAxis}
                  {yAxis}
                  <Tooltip content={tooltip} cursor={cursor} />
                  <Bar dataKey="_income" name="Income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="_expenses" name="Expenses" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              ) : view === "cashflow" ? (
                <BarChart {...common} barCategoryGap="32%">
                  {grid}
                  {xAxis}
                  {yAxis}
                  <Tooltip content={tooltip} cursor={cursor} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
                  <Bar dataKey="_net" name="Net cash flow" radius={4} maxBarSize={28}>
                    {plot.map((d) => (
                      // Diverging pair: blue above zero, red below.
                      <Cell key={d.month} fill={d._net < 0 ? "var(--chart-8)" : "var(--chart-1)"} />
                    ))}
                  </Bar>
                </BarChart>
              ) : view === "savings" ? (
                <ComposedChart {...common} barCategoryGap="32%">
                  {grid}
                  {xAxis}
                  {yAxis}
                  <Tooltip content={tooltip} cursor={cursor} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
                  <Bar dataKey="_net" name="Saved this month" fill="var(--chart-1)" radius={4} maxBarSize={28} />
                  <Line
                    dataKey="_cumulativeSavings"
                    name="Cumulative"
                    stroke="var(--chart-7)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "var(--chart-7)", stroke: "var(--card)", strokeWidth: 2 }}
                    activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                  />
                </ComposedChart>
              ) : (
                <LineChart {...common}>
                  {grid}
                  {xAxis}
                  {yAxis}
                  <Tooltip content={tooltip} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
                  <Line
                    dataKey="_netWorth"
                    name="Net worth"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    connectNulls={false}
                    dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
                    activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{def.note}</p>
      </div>
    </section>
  );
}
