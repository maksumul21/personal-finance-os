"use client";

import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { PageHeader, SectionCard } from "@/components/layout/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extraLoanPayment, goalBySaving, monthlyChange, type ForecastBase } from "@/domain/what-if";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface WhatIfLoan {
  id: string;
  name: string;
  outstanding: string;
  annualRate: string;
  emi: string;
}

export interface WhatIfGoal {
  id: string;
  name: string;
  remaining: string;
  targetDate: string | null;
  requiredMonthly: string | null;
}

/** Plain non-negative amount with up to 2 dp, or null while the input is incomplete. */
function amount(raw: string): string | null {
  const s = raw.replace(/[,\s৳]/g, "");
  return /^\d{1,12}(\.\d{1,2})?$/.test(s) ? s : null;
}

const month = (ym: string) => format(parseISO(`${ym}-01`), "MMMM yyyy");
const day = (d: string) => format(parseISO(d), "d MMM yyyy");

function Result({ label, before, after, tone }: { label: string; before: React.ReactNode; after: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{before}</span>
        <span aria-hidden>→</span>
        <span className={cn("tabular font-semibold", tone === "good" && "text-positive", tone === "bad" && "text-negative")}>{after}</span>
      </p>
    </div>
  );
}

function LoanScenario({ loans, fmt }: { loans: WhatIfLoan[]; fmt: (v: string) => string }) {
  const [loanId, setLoanId] = useState(loans[0]?.id ?? "");
  const [extra, setExtra] = useState("2000");
  const loan = loans.find((l) => l.id === loanId);
  const x = amount(extra);
  const r = loan && x !== null ? extraLoanPayment(loan.outstanding, loan.annualRate, loan.emi, x) : null;

  return (
    <SectionCard title="Pay extra on a loan" description="Paying more than the EMI every month: how much sooner and how much less interest.">
      {loans.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Add a loan with its rate and term in <Link href="/debts" className="text-primary hover:underline">Debts</Link> to try this.
        </p>
      ) : (
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Loan</Label>
              <Select value={loanId} onValueChange={setLoanId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {loans.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loan && (
                <p className="text-xs text-muted-foreground">
                  Owed {fmt(loan.outstanding)} · {loan.annualRate}% · EMI {fmt(loan.emi)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-extra">Extra each month</Label>
              <Input id="w-extra" inputMode="decimal" className="tabular" value={extra} onChange={(e) => setExtra(e.target.value)} aria-invalid={x === null} />
            </div>
          </div>
          {r && (
            <div className="space-y-3" aria-live="polite">
              <div className="grid gap-3 sm:grid-cols-2">
                <Result label="Months to pay off" before={r.base.months ?? "never"} after={r.withExtra.months ?? "never"} tone={r.monthsSaved ? "good" : undefined} />
                <Result
                  label="Interest still to pay"
                  before={r.base.interest ? fmt(r.base.interest.toFixed(2)) : "—"}
                  after={r.withExtra.interest ? fmt(r.withExtra.interest.toFixed(2)) : "—"}
                  tone={r.interestSaved?.greaterThan(0) ? "good" : undefined}
                />
              </div>
              <p className="text-sm">
                {r.monthsSaved !== null && r.interestSaved
                  ? r.monthsSaved > 0 || r.interestSaved.greaterThan(0)
                    ? `Debt-free ${r.monthsSaved} month${r.monthsSaved === 1 ? "" : "s"} sooner and ${fmt(r.interestSaved.toFixed(2))} less interest.`
                    : "No change at this amount."
                  : r.withExtra.months !== null
                    ? `With the extra payment the loan clears in ${r.withExtra.months} months; at the EMI alone it doesn't clear.`
                    : "At this amount the payment doesn't cover the interest, so the loan never clears."}
              </p>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function ChangeScenario({ base, fmt }: { base: ForecastBase; fmt: (v: string) => string }) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [value, setValue] = useState("5000");
  const [dom, setDom] = useState("1");
  const x = amount(value);
  const d = Number(dom);
  const valid = x !== null && Number.isInteger(d) && d >= 1 && d <= 31;
  const r = valid ? monthlyChange(base, direction === "out" ? `-${x}` : x!, d) : null;
  const s = (m: { toFixed: (n: number) => string }) => fmt(m.toFixed(2));

  return (
    <SectionCard
      title="Change something every month"
      description={`A new expense, a cut, a raise or lost income: its effect on your cash over the next 90 days (to ${day(base.end)}), including your usual day-to-day spending.`}
    >
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Change</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "out" | "in")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="out">Extra spending / less income</SelectItem>
                <SelectItem value="in">Less spending / more income</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-amount">Amount a month</Label>
            <Input id="w-amount" inputMode="decimal" className="tabular" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={x === null} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-day">Day of month</Label>
            <Input id="w-day" inputMode="numeric" className="tabular" value={dom} onChange={(e) => setDom(e.target.value)} aria-invalid={!valid && x !== null} />
          </div>
        </div>
        {r && (
          <div className="space-y-3" aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-3">
              <Result
                label="Lowest balance"
                before={s(r.base.lowest)}
                after={s(r.scenario.lowest)}
                tone={r.scenario.lowest.isNegative() ? "bad" : r.scenario.lowest.greaterThan(r.base.lowest) ? "good" : undefined}
              />
              <Result label={`On ${day(base.end)}`} before={s(r.base.end)} after={s(r.scenario.end)} tone={r.endDifference.isNegative() ? "bad" : r.endDifference.isPositive() ? "good" : undefined} />
              <Result
                label="First day below zero"
                before={r.base.firstNegative ? day(r.base.firstNegative) : "never"}
                after={r.scenario.firstNegative ? day(r.scenario.firstNegative) : "never"}
                tone={r.scenario.firstNegative ? "bad" : "good"}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Applied {r.occurrences.length} time{r.occurrences.length === 1 ? "" : "s"} ({r.occurrences.map((o) => format(parseISO(o), "d MMM")).join(", ") || "not in this period"}). See the full
              picture in the <Link href="/forecast" className="text-primary hover:underline">cash-flow forecast</Link>.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function GoalScenario({ goals, today, fmt }: { goals: WhatIfGoal[]; today: string; fmt: (v: string) => string }) {
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const goal = goals.find((g) => g.id === goalId);
  const [monthly, setMonthly] = useState(goals[0]?.requiredMonthly ?? "5000");
  const x = amount(monthly);
  const r = goal && x !== null ? goalBySaving(goal.remaining, x, today, goal.targetDate) : null;

  return (
    <SectionCard title="Save a fixed amount for a goal" description="How long it takes to reach a goal if you put the same amount aside every month, starting this month (as on the Goals page).">
      {goals.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Create a goal in <Link href="/goals" className="text-primary hover:underline">Savings goals</Link> to try this.
        </p>
      ) : (
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Goal</Label>
              <Select
                value={goalId}
                onValueChange={(id) => {
                  setGoalId(id);
                  const g = goals.find((x) => x.id === id);
                  if (g?.requiredMonthly) setMonthly(g.requiredMonthly);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {goals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {goal && (
                <p className="text-xs text-muted-foreground">
                  {fmt(goal.remaining)} to go{goal.targetDate ? ` · target ${day(goal.targetDate)}` : ""}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-monthly">Save each month</Label>
              <Input id="w-monthly" inputMode="decimal" className="tabular" value={monthly} onChange={(e) => setMonthly(e.target.value)} aria-invalid={x === null} />
            </div>
          </div>
          <div aria-live="polite" className="text-sm">
            {goal && x !== null && !r && <p className="text-muted-foreground">Enter an amount above zero.</p>}
            {r && (
              <div className="space-y-1">
                <p>
                  {r.months === 0 ? (
                    "This goal is already reached."
                  ) : (
                    <>
                      Reached in <span className="font-semibold">{r.months} month{r.months === 1 ? "" : "s"}</span>, by <span className="font-semibold">{month(r.reachedIn)}</span>.
                    </>
                  )}
                </p>
                {r.meetsTarget !== null && r.months > 0 && (
                  <p className={r.meetsTarget ? "text-positive" : "text-negative"}>
                    {r.meetsTarget ? "✓ In time for the target date." : "✗ Later than the target date."}
                    {!r.meetsTarget && r.neededForTarget && ` Saving ${fmt(r.neededForTarget.toFixed(2))} a month would make it.`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function WhatIfView({
  loans,
  goals,
  base,
  currency,
  pref,
}: {
  loans: WhatIfLoan[];
  goals: WhatIfGoal[];
  base: ForecastBase;
  currency: string;
  pref: NumberFormatPref;
}) {
  const fmt = (v: string) => formatMoney(v, currency, { pref, compactDecimals: true });
  return (
    <>
      <PageHeader title="What if…?" description="Try a change before you make it. Nothing here is saved or changes your records. Estimates from your data, not financial advice." />
      <div className="space-y-6">
        <LoanScenario loans={loans} fmt={fmt} />
        <ChangeScenario base={base} fmt={fmt} />
        <GoalScenario goals={goals} today={base.today} fmt={fmt} />
      </div>
    </>
  );
}
