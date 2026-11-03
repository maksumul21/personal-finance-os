"use client";

import { ArrowLeft, CheckCircle2, MoreHorizontal, Plus, Repeat, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BudgetProgress, UsageBadge } from "@/components/finance/budget-progress";
import { FinanceIcon } from "@/components/finance/finance-icon";
import { Money } from "@/components/finance/money";
import { EmptyState, SectionCard } from "@/components/layout/page";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BudgetDetailDTO, BudgetLineDTO } from "@/server/queries/budgets.query";
import type { ComposerCategory } from "@/server/queries/composer.query";
import {
  addAllocationAction,
  deleteAllocationAction,
  deleteBudgetAction,
  updateAllocationAction,
  updateBudgetSettingsAction,
} from "../actions";
import { METHOD_INFO, PERIOD_LABELS } from "./budget-form-dialog";
import { periodText } from "./budgets-list";
import { NoCategoriesHint } from "@/features/categories/components/no-categories-hint";

type Fmt = (v: string) => string;

const BUCKET_LABELS: Record<string, string> = {
  needs: "Needs (essential categories)",
  wants: "Wants (other categories)",
  living: "Living costs (all categories)",
  savings: "Savings & investments",
  debt: "Debt repayment & giving",
};

/** Inline amount editor: saves on Enter or blur, only when the value changed. */
function AmountEditor({ line }: { line: BudgetLineDTO }) {
  const [value, setValue] = useState(line.allocated);
  const [pending, start] = useTransition();
  const save = () => {
    const cleaned = value.replace(/[,\s৳]/g, "");
    if (cleaned === line.allocated || Number(cleaned) === Number(line.allocated)) return;
    start(async () => {
      const r = await updateAllocationAction({ id: line.id, allocatedAmount: value, rolloverEnabled: line.rolloverEnabled });
      if (!r.ok) {
        toast.error(r.fieldErrors?.allocatedAmount?.[0] ?? r.error);
        setValue(line.allocated);
      }
    });
  };
  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      inputMode="decimal"
      aria-label={`Budget for ${line.name}`}
      disabled={pending}
      className="tabular h-8 w-28 text-right"
    />
  );
}

function LineMenu({ line }: { line: BudgetLineDTO }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(ok);
      else toast.error((r as { error: string }).error);
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Options for ${line.name}`} disabled={pending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {line.kind === "EXPENSE_CATEGORY" && (
          <>
            <DropdownMenuCheckboxItem
              checked={line.rolloverEnabled}
              onCheckedChange={(checked) =>
                run(
                  () => updateAllocationAction({ id: line.id, allocatedAmount: line.allocated, rolloverEnabled: checked }),
                  checked ? "Rollover on" : "Rollover off",
                )
              }
            >
              Roll over unused amount
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteAllocationAction({ id: line.id }), "Line removed")}>
          <Trash2 /> Remove from budget
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExpenseLine({ line, fmt }: { line: BudgetLineDTO; fmt: Fmt }) {
  const over = Number(line.remaining) < 0;
  const prev = Number(line.previousSpent);
  const diff = Number(line.spent) - prev;
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 px-4 py-4 sm:px-5">
      <FinanceIcon name={line.icon} color={line.color} size="sm" className="mt-0.5" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{line.name}</span>
          <UsageBadge state={line.state!} usagePct={line.usagePct} />
          {line.rolloverEnabled && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Repeat className="size-3" aria-hidden /> rollover {line.carry !== "0.00" && `+${fmt(line.carry)}`}
            </span>
          )}
        </div>
        <BudgetProgress usagePct={line.usagePct} state={line.state!} label={`${line.name} budget`} className="mt-2" />
        <p className="tabular mt-1.5 text-xs text-muted-foreground">
          Spent {fmt(line.spent!)} of {fmt(line.available)} ·{" "}
          <span className={cn(over && "font-medium text-negative")}>
            {over ? `${fmt(line.remaining!.slice(1))} over` : `${fmt(line.remaining!)} left`}
          </span>
          {prev > 0 && (
            <span className="hidden sm:inline">
              {" "}
              · last period {fmt(line.previousSpent!)} ({diff >= 0 ? "+" : "−"}
              {fmt(Math.abs(diff).toFixed(2))})
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <AmountEditor key={line.allocated} line={line} />
        <LineMenu line={line} />
      </div>
    </li>
  );
}

function AddLineDialog({
  open,
  onOpenChange,
  budget,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  budget: BudgetDetailDTO;
  categories: ComposerCategory[];
}) {
  const [kind, setKind] = useState<"EXPENSE_CATEGORY" | "SAVINGS" | "DEBT_REPAYMENT" | "INVESTMENT">("EXPENSE_CATEGORY");
  const [categoryId, setCategoryId] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [rollover, setRollover] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  // Hide categories already limited, and subcategories of limited groups (and vice versa).
  const used = new Set(budget.lines.map((l) => l.categoryId).filter(Boolean));
  const expense = categories.filter((c) => c.kind === "EXPENSE" && !c.isArchived);
  const groupOf = new Map(expense.map((c) => [c.id, c.group ? expense.find((g) => g.group === null && g.name === c.group)?.id : null]));
  const available = expense.filter((c) => {
    if (used.has(c.id)) return false;
    const parent = groupOf.get(c.id);
    if (parent && used.has(parent)) return false;
    if (!c.group && expense.some((child) => groupOf.get(child.id) === c.id && used.has(child.id))) return false;
    return true;
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await addAllocationAction({
        budgetId: budget.id,
        kind,
        categoryId: kind === "EXPENSE_CATEGORY" ? categoryId : "",
        label: kind === "EXPENSE_CATEGORY" ? "" : label,
        allocatedAmount: amount,
        rolloverEnabled: rollover,
      });
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v[0]])));
        toast.error(r.error);
        return;
      }
      toast.success("Added to budget");
      setCategoryId("");
      setLabel("");
      setAmount("");
      setRollover(false);
      setErrors({});
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to budget</DialogTitle>
          <DialogDescription>
            Category limits are compared with spending. Savings, investment and debt lines are planning entries only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE_CATEGORY">Spending limit for a category</SelectItem>
                <SelectItem value="SAVINGS">Savings</SelectItem>
                <SelectItem value="INVESTMENT">Investment</SelectItem>
                <SelectItem value="DEBT_REPAYMENT">Debt repayment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "EXPENSE_CATEGORY" ? (
            <div className="space-y-2">
              <Label>Category</Label>
              {expense.length === 0 ? (
                <NoCategoriesHint kind="EXPENSE" />
              ) : (
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="w-full" aria-invalid={!!errors.categoryId}>
                    <SelectValue placeholder="Choose category" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {/* Sections come from every group: a group can be unavailable as a whole (one of
                        its subcategories already has a limit) while its other subcategories remain. */}
                    {expense
                      .filter((g) => g.group === null)
                      .map((g) => {
                        const groupFree = available.includes(g);
                        const children = available.filter((c) => c.group === g.name);
                        if (!groupFree && children.length === 0) return null;
                        return (
                          <SelectGroup key={g.id}>
                            <SelectLabel>{g.name}</SelectLabel>
                            {groupFree && <SelectItem value={g.id}>All of {g.name}</SelectItem>}
                            {children.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="pl-5">
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })}
                  </SelectContent>
                </Select>
              )}
              {errors.categoryId && <p className="text-xs text-negative">{errors.categoryId}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="line-label">Name</Label>
              <Input id="line-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Emergency fund" />
              {errors.label && <p className="text-xs text-negative">{errors.label}</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="line-amount">Amount</Label>
            <Input id="line-amount" inputMode="decimal" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {errors.allocatedAmount && <p className="text-xs text-negative">{errors.allocatedAmount}</p>}
          </div>
          {kind === "EXPENSE_CATEGORY" && (
            <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">Roll over unused amount</span>
                <span className="block text-xs text-muted-foreground">Carries what’s left into the next period’s budget for this category.</span>
              </span>
              <Switch checked={rollover} onCheckedChange={setRollover} />
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ open, onOpenChange, budget }: { open: boolean; onOpenChange: (o: boolean) => void; budget: BudgetDetailDTO }) {
  const router = useRouter();
  const [name, setName] = useState(budget.name);
  const [source, setSource] = useState(budget.incomeSource);
  const [income, setIncome] = useState(budget.plannedIncome ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await updateBudgetSettingsAction({ id: budget.id, name, incomeSource: source, plannedIncome: income });
      if (r.ok) {
        toast.success("Budget updated");
        onOpenChange(false);
      } else toast.error(r.error);
    });
  };
  const remove = () =>
    start(async () => {
      const r = await deleteBudgetAction({ id: budget.id });
      if (r.ok) {
        toast.success("Budget deleted");
        router.push("/budgets");
      } else toast.error(r.error);
    });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Budget settings</DialogTitle>
            <DialogDescription>
              {PERIOD_LABELS[budget.periodType]} · {periodText(budget.start, budget.end)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bs-name">Name</Label>
              <Input id="bs-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Income to allocate</Label>
              <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNED">An amount I enter</SelectItem>
                  <SelectItem value="ACTUAL">Income actually received</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {source === "PLANNED" && (
              <div className="space-y-2">
                <Label htmlFor="bs-income">Planned income</Label>
                <Input id="bs-income" inputMode="decimal" className="tabular" value={income} onChange={(e) => setIncome(e.target.value)} />
              </div>
            )}
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" className="text-negative" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete budget
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{budget.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The plan and its limits are removed. Your transactions and account balances are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={pending} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function BudgetDetail({
  budget,
  categories,
  currency,
  pref,
}: {
  budget: BudgetDetailDTO;
  categories: ComposerCategory[];
  currency: string;
  pref: NumberFormatPref;
}) {
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const fmt: Fmt = (v) => formatMoney(v, currency, { pref, compactDecimals: true });
  const expenseLines = budget.lines.filter((l) => l.kind === "EXPENSE_CATEGORY");
  const planLines = budget.lines.filter((l) => l.kind !== "EXPENSE_CATEGORY");
  const zb = budget.zeroBased;
  const t = budget.totals;

  return (
    <>
      <Link href="/budgets" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Budgets
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{budget.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {PERIOD_LABELS[budget.periodType]} · {periodText(budget.start, budget.end)}
            <Badge variant="secondary">{METHOD_INFO[budget.method].label}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSettings(true)}>
            <Settings2 /> Settings
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add line
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: "Budgeted", value: t.expenseBudget, hint: "Category limits + rollover" },
          { label: "Spent", value: t.spent, hint: `Last period ${fmt(t.previousSpent)}` },
          { label: "Remaining", value: t.remaining, hint: t.usagePct ? `${t.usagePct}% used` : "Nothing budgeted yet", tone: "auto" as const },
          { label: "Unbudgeted spending", value: t.unbudgeted, hint: "Categories without a limit" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border bg-card shadow-card p-4 sm:p-5">
            <p className="text-sm font-medium text-muted-foreground">{k.label}</p>
            <Money value={k.value} currency={currency} pref={pref} tone={k.tone ?? "neutral"} compactDecimals className="mt-2 block text-xl font-semibold tracking-tight sm:text-2xl" />
            <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="Spending limits"
            description="Each limit includes its subcategories. Transfers between accounts are never counted."
          >
            {expenseLines.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  className="py-8"
                  icon={Plus}
                  title="No limits yet"
                  description="Add a limit for categories like Food or Transportation to track spending against it."
                  action={<Button onClick={() => setAdding(true)}>Add a limit</Button>}
                />
              </div>
            ) : (
              <ul className="divide-y">
                {expenseLines.map((l) => (
                  <ExpenseLine key={l.id} line={l} fmt={fmt} />
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Savings, investments & debt" description="Planning entries. Balances change only when you record a real transfer.">
            {planLines.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Nothing planned. Use “Add line” to set money aside in the plan.</p>
            ) : (
              <ul className="divide-y">
                {planLines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <FinanceIcon name={l.icon} color="#64748b" size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.kind === "SAVINGS" ? "Savings" : l.kind === "INVESTMENT" ? "Investment" : "Debt repayment"}
                      </span>
                    </span>
                    <AmountEditor key={l.allocated} line={l} />
                    <LineMenu line={l} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Zero-based check"
            description={budget.incomeSource === "PLANNED" ? "Against your planned income" : "Against income received in this period"}
          >
            <dl className="space-y-2.5 p-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Available income</dt>
                <dd className="tabular font-medium">{fmt(budget.availableIncome)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total allocated</dt>
                <dd className="tabular font-medium">{fmt(zb.totalAllocated)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2.5">
                <dt className="font-medium">Unallocated</dt>
                <dd className={cn("tabular font-semibold", zb.status === "over-allocated" && "text-negative")}>
                  {zb.status === "over-allocated" ? `−${fmt(zb.unallocated.slice(1))}` : fmt(zb.unallocated)}
                </dd>
              </div>
            </dl>
            <p
              className={cn(
                "mx-5 mb-5 flex items-center gap-2 rounded-md px-3 py-2 text-xs",
                zb.status === "complete" ? "bg-positive-soft text-positive" : zb.status === "over-allocated" ? "bg-negative-soft text-negative" : "bg-muted text-muted-foreground",
              )}
            >
              {zb.status === "complete" && <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
              {zb.status === "complete"
                ? "Every taka has a job. Allocation complete."
                : zb.status === "over-allocated"
                  ? "You've planned more than the available income."
                  : "Some income isn't allocated yet."}
            </p>
          </SectionCard>

          {budget.buckets && (
            <SectionCard title={`${METHOD_INFO[budget.method].label} targets`} description="Planned amounts vs the template's share of income">
              <ul className="space-y-4 p-5">
                {budget.buckets.map((b) => {
                  const pct = Number(b.target) > 0 ? Math.min(100, (Number(b.planned) / Number(b.target)) * 100) : 0;
                  const diff = Number(b.difference);
                  return (
                    <li key={b.bucket}>
                      <div className="mb-1 flex justify-between gap-2 text-sm">
                        <span>
                          {BUCKET_LABELS[b.bucket]} <span className="text-muted-foreground">· {b.targetPct}%</span>
                        </span>
                        <span className="tabular text-muted-foreground">
                          {fmt(b.planned)} / {fmt(b.target)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {diff === 0 ? "On target" : diff > 0 ? `${fmt(b.difference)} below target` : `${fmt(b.difference.slice(1))} above target`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>

      <AddLineDialog open={adding} onOpenChange={setAdding} budget={budget} categories={categories} />
      <SettingsDialog key={`${budget.name}${budget.plannedIncome}${budget.incomeSource}`} open={settings} onOpenChange={setSettings} budget={budget} />
    </>
  );
}
