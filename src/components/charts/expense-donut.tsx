"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from "recharts";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import type { BreakdownSlice } from "@/server/queries/dashboard.query";

/**
 * Expense breakdown by top-level category (PRD §4.2). Slots follow the category, not its rank.
 * The labelled list beside the donut doubles as the table view (several light-mode slots are
 * below 3:1 contrast, so labels are required, not optional).
 */
export function ExpenseDonut({
  slices,
  total,
  currency,
  pref,
}: {
  slices: BreakdownSlice[];
  total: string;
  currency: string;
  pref: NumberFormatPref;
}) {
  const data = slices.map((s) => ({ ...s, value: Number(s.amount) }));
  const tooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const s = payload[0].payload as BreakdownSlice;
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="font-medium text-popover-foreground">{s.name}</p>
        <p className="tabular text-muted-foreground">
          {formatMoney(s.amount, currency, { pref })} · {s.pct}%
        </p>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative size-44 shrink-0" role="img" aria-label="Expense breakdown donut chart; values listed alongside.">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={tooltip} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.categoryId} fill={`var(--chart-${d.slot})`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[11px] text-muted-foreground">Spent</p>
            <p className="tabular text-sm font-semibold">{formatMoney(total, currency, { pref, compactDecimals: true })}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.categoryId} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: `var(--chart-${s.slot})` }} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="tabular text-muted-foreground">{s.pct}%</span>
            <span className="tabular w-24 text-right font-medium">{formatMoney(s.amount, currency, { pref, compactDecimals: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
