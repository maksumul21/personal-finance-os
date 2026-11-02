"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, HandCoins, PiggyBank, Receipt, Repeat } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { KpiCard } from "@/components/finance/kpi-card";
import { PageHeader, SectionCard } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { shiftMonth, type CalendarEvent } from "@/domain/calendar";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarDTO } from "@/server/queries/calendar.query";

const KIND = {
  BILL: { label: "Bill", icon: Receipt },
  RECURRING: { label: "Recurring", icon: Repeat },
  EMI: { label: "Loan EMI", icon: HandCoins },
  GOAL: { label: "Goal", icon: PiggyBank },
} as const;

/** Never colour alone: every status also has a text label (D-020). */
const STATUS: Record<CalendarEvent["status"], { label: string; cls: string; dot: string }> = {
  OVERDUE: { label: "Overdue", cls: "bg-negative-soft text-negative", dot: "bg-negative" },
  DUE: { label: "Due", cls: "bg-warning-soft text-foreground", dot: "bg-warning" },
  PROJECTED: { label: "Scheduled", cls: "bg-accent text-accent-foreground", dot: "bg-primary" },
  TARGET: { label: "Target date", cls: "bg-muted text-foreground", dot: "bg-muted-foreground" },
  DONE: { label: "Done", cls: "bg-positive-soft text-positive", dot: "bg-positive" },
  SKIPPED: { label: "Skipped", cls: "bg-muted text-muted-foreground line-through", dot: "bg-muted-foreground" },
};

function signed(e: CalendarEvent, fmt: (v: string, c: string) => string) {
  if (e.amount === null) return null;
  const prefix = e.direction === "IN" ? "+" : e.direction === "OUT" ? "−" : "";
  return `${prefix}${fmt(e.amount, e.currency)}`;
}

export function CalendarView({ data, pref }: { data: CalendarDTO; pref: NumberFormatPref }) {
  const [selected, setSelected] = useState<string | null>(null);
  const fmt = (v: string, c: string) => formatMoney(v, c, { pref, compactDecimals: true });
  const first = parseISO(`${data.month}-01`);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of data.events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const agendaDays = [...byDay.keys()].filter((d) => !selected || d === selected);
  const t = data.totals;
  const weekdays = data.weeks[0].map((d) => format(parseISO(d.date), "EEE"));

  return (
    <>
      <PageHeader
        title="Financial calendar"
        description="Bills, recurring transactions, loan instalments and goal dates in one place, with what was actually spent each day."
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard label="Received this month" value={fmt(t.actualIn, data.baseCurrency)} hint="Recorded income" />
          <KpiCard label="Spent this month" value={fmt(t.actualOut, data.baseCurrency)} hint="Recorded expenses; transfers excluded" />
          <KpiCard label="Still expected in" value={fmt(t.expectedIn, data.baseCurrency)} hint="Scheduled income not yet recorded" />
          <KpiCard
            label="Still to pay"
            value={fmt(t.expectedOut, data.baseCurrency)}
            hint={t.overdueCount ? <span className="text-negative">{t.overdueCount} overdue</span> : "Bills, scheduled expenses and EMIs"}
          />
        </div>

        <SectionCard
          title={format(first, "MMMM yyyy")}
          description="Select a day to see its items below."
          actions={
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="icon-sm" aria-label="Previous month">
                <Link href={`/calendar?month=${shiftMonth(data.month, -1)}`} scroll={false}>
                  <ChevronLeft />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/calendar" scroll={false}>
                  Today
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon-sm" aria-label="Next month">
                <Link href={`/calendar?month=${shiftMonth(data.month, 1)}`} scroll={false}>
                  <ChevronRight />
                </Link>
              </Button>
            </div>
          }
        >
          <div className="p-2 sm:p-4">
            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground" aria-hidden>
              {weekdays.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div role="grid" aria-label={format(first, "MMMM yyyy")} className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
              {data.weeks.flat().map(({ date, inMonth }) => {
                const events = byDay.get(date) ?? [];
                const actual = data.actuals[date];
                const isToday = date === data.today;
                const isSelected = date === selected;
                return (
                  <button
                    key={date}
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-label={`${format(parseISO(date), "d MMMM")}: ${events.length} item(s)`}
                    onClick={() => setSelected(isSelected ? null : date)}
                    className={cn(
                      "flex min-h-14 flex-col items-stretch gap-0.5 bg-card p-1 text-left align-top sm:min-h-24 sm:p-1.5",
                      !inMonth && "bg-muted/40 text-muted-foreground",
                      isSelected && "ring-2 ring-primary ring-inset",
                    )}
                  >
                    <span className={cn("self-start rounded-full px-1.5 text-xs tabular", isToday && "bg-primary font-semibold text-primary-foreground")}>
                      {format(parseISO(date), "d")}
                    </span>
                    {/* Phones: one dot per item. */}
                    <span className="flex flex-wrap gap-0.5 sm:hidden">
                      {events.slice(0, 4).map((e) => (
                        <span key={e.id} className={cn("size-1.5 rounded-full", STATUS[e.status].dot)} />
                      ))}
                    </span>
                    {/* Larger screens: up to 3 chips. */}
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {events.slice(0, 3).map((e) => (
                        <span key={e.id} className={cn("truncate rounded px-1 py-0.5 text-[10px] leading-tight", STATUS[e.status].cls)}>
                          {e.title}
                        </span>
                      ))}
                      {events.length > 3 && <span className="px-1 text-[10px] text-muted-foreground">+{events.length - 3} more</span>}
                    </span>
                    {actual && Number(actual.expenses) > 0 && (
                      <span className="mt-auto hidden truncate text-[10px] text-muted-foreground tabular sm:block">spent {fmt(actual.expenses, data.baseCurrency)}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
              {(["OVERDUE", "DUE", "PROJECTED", "DONE", "TARGET"] as const).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS[s].dot)} aria-hidden />
                  {STATUS[s].label}
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard
          title={selected ? format(parseISO(selected), "EEEE d MMMM") : "This month"}
          actions={
            selected ? (
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Show whole month
              </Button>
            ) : undefined
          }
        >
          {agendaDays.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted-foreground">
              <CalendarDays className="size-5" aria-hidden />
              {selected ? "Nothing scheduled this day." : "Nothing scheduled this month."}
              {selected && data.actuals[selected] && ` Spent ${fmt(data.actuals[selected].expenses, data.baseCurrency)}.`}
            </div>
          ) : (
            <ul className="divide-y">
              {agendaDays.map((d) => (
                <li key={d} className="px-5 py-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {format(parseISO(d), "EEE d MMM")}
                    {d === data.today && " · Today"}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {byDay.get(d)!.map((e) => {
                      const Icon = KIND[e.kind].icon;
                      return (
                        <li key={e.id}>
                          <Link href={e.href} className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-muted">
                            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm">{e.title}</span>
                              <span className="text-xs text-muted-foreground">{KIND[e.kind].label}</span>
                            </span>
                            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS[e.status].cls)}>{STATUS[e.status].label}</span>
                            <span
                              className={cn(
                                "w-28 shrink-0 text-right text-sm tabular",
                                e.direction === "IN" && "text-positive",
                                e.status === "SKIPPED" && "line-through text-muted-foreground",
                              )}
                            >
                              {signed(e, fmt) ?? ""}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
