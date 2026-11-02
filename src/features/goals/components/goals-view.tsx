"use client";

import { format, parseISO } from "date-fns";
import { Archive, ArchiveRestore, ChevronDown, Minus, MoreHorizontal, Pencil, PiggyBank, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FinanceIcon } from "@/components/finance/finance-icon";
import { EmptyState, PageHeader, SectionCard } from "@/components/layout/page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { emergencyTarget } from "@/domain/goals";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComposerAccount } from "@/server/queries/composer.query";
import type { ContributionDTO, GoalDTO } from "@/server/queries/goals.query";
import { archiveGoalAction, deleteContributionAction, deleteGoalAction } from "../actions";
import type { GoalFormInput } from "../schemas";
import { ContributionDialog } from "./contribution-dialog";
import { GOAL_TYPE_INFO, GoalFormDialog } from "./goal-form-dialog";

const PACE: Record<GoalDTO["pace"], { label: string; cls: string }> = {
  achieved: { label: "Achieved", cls: "bg-positive-soft text-positive" },
  "on-track": { label: "On track", cls: "bg-accent text-accent-foreground" },
  behind: { label: "Behind", cls: "bg-warning-soft text-foreground" },
  overdue: { label: "Past target date", cls: "bg-negative-soft text-negative" },
  "no-date": { label: "No target date", cls: "bg-muted text-muted-foreground" },
};

function blankGoal(type: GoalFormInput["goalType"] = "GOAL"): GoalFormInput {
  return {
    name: type === "EMERGENCY_FUND" ? "Emergency fund" : "",
    goalType: type,
    targetAmount: "",
    targetDate: "",
    description: "",
    icon: type === "EMERGENCY_FUND" ? "shield-check" : "piggy-bank",
    color: "#0d9488",
    priority: type === "EMERGENCY_FUND" ? "HIGH" : "MEDIUM",
    linkedAccountId: "",
    essentialMonthly: "",
    targetMonths: 6,
  };
}

function toForm(g: GoalDTO): GoalFormInput {
  return {
    name: g.name,
    goalType: g.goalType,
    targetAmount: g.goalType === "EMERGENCY_FUND" ? "" : g.target,
    targetDate: g.targetDate ?? "",
    description: g.description ?? "",
    icon: g.icon,
    color: g.color,
    priority: g.priority,
    linkedAccountId: g.linkedAccount?.id ?? "",
    essentialMonthly: g.essentialMonthly ?? "",
    targetMonths: g.targetMonths ?? 6,
  };
}

type Dialog =
  | { kind: "goal"; editId?: string; defaults: GoalFormInput; lockAccount?: boolean }
  | { kind: "contribution"; goal: GoalDTO; direction: "DEPOSIT" | "WITHDRAWAL"; editing?: ContributionDTO }
  | { kind: "delete"; goal: GoalDTO }
  | null;

function History({ goal, fmt, onEdit }: { goal: GoalDTO; fmt: (v: string) => string; onEdit: (c: ContributionDTO) => void }) {
  const [pending, start] = useTransition();
  if (goal.contributions.length === 0) return <p className="px-5 pb-4 text-sm text-muted-foreground">No contributions yet.</p>;
  return (
    <ul className="divide-y border-t">
      {goal.contributions.map((c) => (
        <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
          <span className={cn("tabular w-24 font-medium", c.direction === "DEPOSIT" ? "text-positive" : "")}>
            {c.direction === "DEPOSIT" ? "+" : "−"}
            {fmt(c.amount)}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {format(parseISO(c.date), "d MMM yyyy")}
            {c.otherAccount ? ` · ${c.direction === "DEPOSIT" ? "from" : "to"} ${c.otherAccount}` : " · set aside"}
            {c.notes ? ` · ${c.notes}` : ""}
          </span>
          <Button variant="ghost" size="icon-xs" aria-label="Edit contribution" onClick={() => onEdit(c)}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete contribution"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteContributionAction({ id: c.id });
                if (r.ok) toast.success(c.otherAccount ? "Contribution and its transfer removed" : "Contribution removed");
                else toast.error(r.error);
              })
            }
          >
            <Trash2 />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function GoalCard({
  goal,
  fmt,
  open,
}: {
  goal: GoalDTO;
  fmt: (v: string) => string;
  open: (d: Dialog) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [pending, start] = useTransition();
  const pct = Math.min(100, Number(goal.progressPct));
  const archived = goal.status === "ARCHIVED";
  const pace = PACE[goal.pace];
  const isEF = goal.goalType === "EMERGENCY_FUND";

  return (
    <li className={cn("rounded-xl border bg-card", archived && "opacity-70")}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <FinanceIcon name={goal.icon} color={goal.color} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-medium">{goal.name}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", pace.cls)}>{pace.label}</span>
              {goal.priority === "HIGH" && !archived && <Badge variant="secondary" className="text-[10px]">High priority</Badge>}
              {archived && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isEF
                ? `${goal.targetMonths} months × ${fmt(goal.essentialMonthly!)} essentials`
                : goal.targetDate
                  ? `By ${format(parseISO(goal.targetDate), "d MMM yyyy")}`
                  : GOAL_TYPE_INFO[goal.goalType].label}
              {goal.linkedAccount ? ` · in ${goal.linkedAccount.name}` : ""}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Options for ${goal.name}`} disabled={pending}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  open({ kind: "goal", editId: goal.id, defaults: toForm(goal), lockAccount: goal.contributions.some((c) => c.otherAccount) })
                }
              >
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  start(async () => {
                    const r = await archiveGoalAction({ id: goal.id, archived: !archived });
                    if (!r.ok) toast.error(r.error);
                  })
                }
              >
                {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => open({ kind: "delete", goal })}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <p className="tabular text-xl font-semibold tracking-tight">{fmt(goal.saved)}</p>
          <p className="tabular text-sm text-muted-foreground">of {fmt(goal.target)}</p>
        </div>
        <div
          role="progressbar"
          aria-label={`${goal.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Progress</dt>
            <dd className="tabular font-medium">{goal.progressPct}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Remaining</dt>
            <dd className="tabular font-medium">{fmt(goal.remaining)}</dd>
          </div>
          {isEF ? (
            <div>
              <dt className="text-muted-foreground">Covers</dt>
              <dd className="tabular font-medium">{goal.monthsCovered} months</dd>
            </div>
          ) : (
            goal.requiredMonthly &&
            goal.pace !== "achieved" && (
              <div>
                <dt className="text-muted-foreground">{goal.pace === "overdue" ? "Still needed" : "Needed monthly"}</dt>
                <dd className="tabular font-medium">{fmt(goal.requiredMonthly)}</dd>
              </div>
            )
          )}
        </dl>

        {!archived && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => open({ kind: "contribution", goal, direction: "DEPOSIT" })}>
              <Plus /> Add money
            </Button>
            <Button size="sm" variant="outline" disabled={goal.saved === "0.00"} onClick={() => open({ kind: "contribution", goal, direction: "WITHDRAWAL" })}>
              <Minus /> Withdraw
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
              History <ChevronDown className={cn("transition-transform", showHistory && "rotate-180")} />
            </Button>
          </div>
        )}
      </div>
      {showHistory && <History goal={goal} fmt={fmt} onEdit={(c) => open({ kind: "contribution", goal, direction: c.direction, editing: c })} />}
    </li>
  );
}

export function GoalsView({
  goals,
  accounts,
  currency,
  pref,
  today,
  suggestion,
}: {
  goals: GoalDTO[];
  accounts: ComposerAccount[];
  currency: string;
  pref: NumberFormatPref;
  today: string;
  suggestion: { amount: string; months: number } | null;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, startDelete] = useTransition();
  const fmt = (v: string) => formatMoney(v, currency, { pref, compactDecimals: true });
  const active = goals.filter((g) => g.status !== "ARCHIVED");
  const ef = active.find((g) => g.goalType === "EMERGENCY_FUND");
  const regular = active.filter((g) => g.goalType === "GOAL");
  const sinking = active.filter((g) => g.goalType === "SINKING_FUND");
  const archived = goals.filter((g) => g.status === "ARCHIVED");
  const close = () => setDialog(null);

  const section = (title: string, description: string, list: GoalDTO[]) =>
    list.length > 0 && (
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((g) => (
            <GoalCard key={g.id} goal={g} fmt={fmt} open={setDialog} />
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <PageHeader
        title="Savings goals"
        description="Goals are allocations, not expenses. Money moves only when you add from another account."
        actions={
          <Button onClick={() => setDialog({ kind: "goal", defaults: blankGoal() })}>
            <Plus /> New goal
          </Button>
        }
      />

      <div className="space-y-8">
        {ef ? (
          section("Emergency fund", "Essential expenses kept aside for surprises. 3–6 months is a common target.", [ef])
        ) : (
          <SectionCard>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                <ShieldCheck className="size-5" />
              </span>
              <div className="flex-1">
                <p className="font-medium">Set up an emergency fund</p>
                <p className="text-sm text-muted-foreground">
                  {suggestion
                    ? `Your essential spending averaged ${fmt(suggestion.amount)} a month over the last ${suggestion.months} months. Six months would be ${fmt(emergencyTarget(suggestion.amount, 6).toFixed(2))}.`
                    : "Cover 3–6 months of essential expenses like rent, utilities, groceries and transport."}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setDialog({ kind: "goal", defaults: { ...blankGoal("EMERGENCY_FUND"), essentialMonthly: suggestion?.amount ?? "" } })}
              >
                Set up
              </Button>
            </div>
          </SectionCard>
        )}

        {section("Goals", "Things you're saving toward.", regular)}
        {section("Sinking funds", "Money set aside for known future expenses.", sinking)}

        {regular.length === 0 && sinking.length === 0 && (
          <EmptyState
            icon={PiggyBank}
            title="No goals yet"
            description="Save for a laptop, travel, Eid shopping or annual insurance. You'll see how much to set aside each month."
            action={
              <Button onClick={() => setDialog({ kind: "goal", defaults: blankGoal() })}>
                <Plus /> Create a goal
              </Button>
            }
          />
        )}

        {section("Archived", "Kept for reference.", archived)}
      </div>

      {dialog?.kind === "goal" && (
        <GoalFormDialog
          open
          onOpenChange={(o) => !o && close()}
          editId={dialog.editId}
          defaults={dialog.defaults}
          accounts={accounts}
          baseCurrency={currency}
          suggestion={suggestion}
          lockAccount={dialog.lockAccount}
        />
      )}
      {dialog?.kind === "contribution" && (
        <ContributionDialog
          open
          onOpenChange={(o) => !o && close()}
          goal={dialog.goal}
          direction={dialog.direction}
          editing={dialog.editing}
          accounts={accounts}
          today={today}
          currency={currency}
        />
      )}
      <AlertDialog open={dialog?.kind === "delete"} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{dialog?.kind === "delete" ? dialog.goal.name : ""}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The goal and its contribution history are removed. Money already transferred stays in its account, and those
              transfers remain in your history. To keep the record instead, archive the goal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                dialog?.kind === "delete" &&
                startDelete(async () => {
                  const r = await deleteGoalAction({ id: dialog.goal.id });
                  if (r.ok) toast.success("Goal deleted");
                  else toast.error(r.error);
                  close();
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
