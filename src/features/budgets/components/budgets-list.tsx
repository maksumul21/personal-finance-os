"use client";

import { format, parseISO } from "date-fns";
import { ChevronRight, Plus, WalletCards } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BudgetProgress, UsageBadge } from "@/components/finance/budget-progress";
import { EmptyState, PageHeader } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import type { BudgetListItem } from "@/server/queries/budgets.query";
import { BudgetFormDialog, METHOD_INFO, PERIOD_LABELS } from "./budget-form-dialog";

export function periodText(start: string, end: string) {
  const s = parseISO(start);
  const e = parseISO(end);
  return s.getFullYear() === e.getFullYear()
    ? `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`
    : `${format(s, "d MMM yyyy")} – ${format(e, "d MMM yyyy")}`;
}

export function BudgetsList({
  budgets,
  currency,
  pref,
  today,
}: {
  budgets: BudgetListItem[];
  currency: string;
  pref: NumberFormatPref;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Budgets"
        description="Plan spending by category and compare it with what you actually spent. Transfers are never counted."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New budget
          </Button>
        }
      />
      {budgets.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title="No budgets yet"
          description="Create a monthly budget to set category limits, plan savings, and see what's left to spend."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> Create your first budget
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {budgets.map((b) => (
            <li key={b.id}>
              <Link
                href={`/budgets/${b.id}`}
                className="block rounded-2xl border bg-card shadow-card p-5 transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {PERIOD_LABELS[b.periodType]} · {periodText(b.start, b.end)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {b.isCurrent && <Badge>Current</Badge>}
                    {b.method !== "STANDARD" && <Badge variant="secondary">{METHOD_INFO[b.method].label}</Badge>}
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                </div>
                {b.expenseBudget === "0.00" ? (
                  <p className="mt-4 text-sm text-muted-foreground">No category limits yet.</p>
                ) : (
                  <>
                    <div className="mt-4 mb-1.5 flex items-center justify-between text-sm">
                      <span className="tabular">
                        {formatMoney(b.spent, currency, { pref, compactDecimals: true })}{" "}
                        <span className="text-muted-foreground">of {formatMoney(b.expenseBudget, currency, { pref, compactDecimals: true })}</span>
                      </span>
                      <UsageBadge state={b.state} usagePct={b.usagePct} />
                    </div>
                    <BudgetProgress usagePct={b.usagePct} state={b.state} label={`${b.name} usage`} />
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <BudgetFormDialog open={open} onOpenChange={setOpen} today={today} copyOptions={budgets.slice(0, 6).map((b) => ({ id: b.id, name: b.name }))} />
    </>
  );
}
