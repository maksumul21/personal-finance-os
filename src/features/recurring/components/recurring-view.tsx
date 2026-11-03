"use client";

import { format, parseISO } from "date-fns";
import { ArrowLeftRight, Ban, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FinanceIcon } from "@/components/finance/finance-icon";
import { Money } from "@/components/finance/money";
import { ScheduleFields } from "@/components/finance/schedule-fields";
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RepeatUnit } from "@/domain/recurrence";
import type { NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComposerData } from "@/server/queries/composer.query";
import type { RecurringDTO } from "@/server/queries/recurring.query";
import { createRecurringAction, deleteRecurringAction, setRecurringStatusAction, updateRecurringAction } from "../actions";
import type { RecurringFormInput } from "../schemas";
import { NoCategoriesHint } from "@/features/categories/components/no-categories-hint";

type TxType = "EXPENSE" | "INCOME" | "TRANSFER";

function RuleForm({
  data,
  editing,
  onDone,
}: {
  data: ComposerData;
  editing?: RecurringDTO;
  onDone: () => void;
}) {
  const baseAccounts = data.accounts.filter((a) => !a.isArchived && a.currency === data.baseCurrency);
  const [v, setV] = useState<RecurringFormInput>(() => ({
    type: editing?.type ?? "EXPENSE",
    amount: editing?.amount ?? "",
    accountId: editing?.account.id ?? baseAccounts.find((a) => !a.isLiability)?.id ?? "",
    toAccountId: editing?.toAccount?.id ?? "",
    categoryId: editing?.category?.id ?? "",
    description: editing?.description ?? "",
    unit: editing?.unit ?? "MONTHLY",
    interval: editing?.interval ?? 1,
    startDate: editing?.startDate ?? data.today,
    endDate: editing?.endDate ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (patch: Partial<RecurringFormInput>) => setV((s) => ({ ...s, ...patch }));
  const kind = v.type === "INCOME" ? "INCOME" : "EXPENSE";
  const categories = data.categories.filter((c) => c.kind === kind && !c.isArchived);
  const sources = v.type === "INCOME" ? baseAccounts.filter((a) => !a.isLiability) : baseAccounts;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = editing ? await updateRecurringAction({ id: editing.id, values: v }) : await createRecurringAction(v);
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, m]) => [k.replace(/^values\./, ""), m[0]])));
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Schedule updated" : "Recurring transaction created");
      onDone();
    });
  };

  const err = (k: string) => (errors[k] ? <p className="text-xs text-negative">{errors[k]}</p> : null);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div role="tablist" aria-label="Type" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(["EXPENSE", "INCOME", "TRANSFER"] as TxType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={v.type === t}
            onClick={() => set({ type: t, categoryId: "" })}
            className={cn("h-8 rounded-md text-sm font-medium", v.type === t ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {t === "EXPENSE" ? "Expense" : t === "INCOME" ? "Income" : "Transfer"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="r-amount">Amount ({data.baseCurrency})</Label>
          <Input id="r-amount" inputMode="decimal" className="tabular" value={v.amount} onChange={(e) => set({ amount: e.target.value })} />
          {err("amount")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-desc">Description</Label>
          <Input id="r-desc" placeholder="e.g. House rent" value={v.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{v.type === "TRANSFER" ? "From" : v.type === "INCOME" ? "Received in" : "Paid from"}</Label>
          <Select value={v.accountId} onValueChange={(id) => set({ accountId: id })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose account" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("accountId")}
        </div>
        {v.type === "TRANSFER" ? (
          <div className="space-y-2">
            <Label>To</Label>
            <Select value={v.toAccountId ?? ""} onValueChange={(id) => set({ toAccountId: id })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose account" />
              </SelectTrigger>
              <SelectContent>
                {baseAccounts
                  .filter((a) => a.id !== v.accountId)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {err("toAccountId")}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Category</Label>
            {categories.length === 0 ? (
              <NoCategoriesHint kind={kind} />
            ) : (
              <Select value={v.categoryId ?? ""} onValueChange={(id) => set({ categoryId: id })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {categories
                    .filter((c) => c.group === null)
                    .map((g) => (
                      <SelectGroup key={g.id}>
                        <SelectLabel>{g.name}</SelectLabel>
                        <SelectItem value={g.id}>{g.name} (general)</SelectItem>
                        {categories
                          .filter((c) => c.group === g.name)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id} className="pl-5">
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    ))}
                </SelectContent>
              </Select>
            )}
            {err("categoryId")}
          </div>
        )}
      </div>
      <ScheduleFields unit={v.unit as RepeatUnit} interval={v.interval} onChange={(unit, interval) => set({ unit, interval })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="r-start">Starts</Label>
          <Input id="r-start" type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          {err("startDate")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-end">Ends (optional)</Label>
          <Input id="r-end" type="date" value={v.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value })} />
          {err("endDate")}
        </div>
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {editing
          ? "Changes apply from today. Transactions already recorded aren't changed."
          : v.startDate < data.today
            ? "The start date is in the past, so occurrences up to today are recorded now."
            : "Each occurrence is recorded automatically on its date, exactly once."}{" "}
        Only {data.baseCurrency} accounts can repeat.
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RuleRow({ r, pref, onEdit, onDelete }: { r: RecurringDTO; pref: NumberFormatPref; onEdit: () => void; onDelete: () => void }) {
  const [pending, start] = useTransition();
  const status = (s: "ACTIVE" | "PAUSED" | "CANCELLED", msg: string) =>
    start(async () => {
      const res = await setRecurringStatusAction({ id: r.id, status: s });
      if (res.ok) toast.success(msg);
      else toast.error(res.error);
    });
  const title = r.description || (r.type === "TRANSFER" ? `Transfer to ${r.toAccount?.name}` : r.category?.name ?? "Recurring");
  const sub = r.type === "TRANSFER" ? `${r.account.name} → ${r.toAccount?.name}` : `${r.category?.name} · ${r.account.name}`;
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3.5 sm:px-5", r.status !== "ACTIVE" && "opacity-70")} aria-busy={pending}>
      {r.type === "TRANSFER" ? (
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ArrowLeftRight className="size-4" />
        </span>
      ) : (
        <FinanceIcon name={r.category?.icon ?? "tag"} color={r.category?.color} />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {title}
          {r.status === "PAUSED" && <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
          {r.status === "CANCELLED" && <Badge variant="outline" className="text-[10px]">Cancelled</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {r.schedule} · {sub}
          {r.nextOccurrence ? ` · next ${format(parseISO(r.nextOccurrence), "d MMM yyyy")}` : r.status === "ACTIVE" ? " · ended" : ""}
        </p>
      </div>
      <Money
        value={r.type === "EXPENSE" ? `-${r.amount}` : r.amount}
        currency={r.currency}
        pref={pref}
        signed={r.type === "INCOME"}
        tone={r.type === "INCOME" ? "positive" : "neutral"}
        className="text-sm font-semibold"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {r.status !== "CANCELLED" && (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          {r.status === "ACTIVE" && (
            <DropdownMenuItem onSelect={() => status("PAUSED", "Paused")}>
              <Pause /> Pause
            </DropdownMenuItem>
          )}
          {r.status === "PAUSED" && (
            <DropdownMenuItem onSelect={() => status("ACTIVE", "Resumed from today")}>
              <Play /> Resume
            </DropdownMenuItem>
          )}
          {r.status !== "CANCELLED" && (
            <DropdownMenuItem onSelect={() => status("CANCELLED", "Cancelled")}>
              <Ban /> Cancel schedule
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function RecurringView({ rules, data, pref }: { rules: RecurringDTO[]; data: ComposerData; pref: NumberFormatPref }) {
  const [form, setForm] = useState<{ open: boolean; editing?: RecurringDTO; key: number }>({ open: false, key: 0 });
  const [toDelete, setToDelete] = useState<RecurringDTO | null>(null);
  const [deleting, startDelete] = useTransition();
  const openForm = (editing?: RecurringDTO) => setForm((f) => ({ open: true, editing, key: f.key + 1 }));

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Salary, rent, subscriptions you pay by transfer: recorded automatically on schedule.</p>
        <Button onClick={() => openForm()} className="shrink-0">
          <Plus /> New schedule
        </Button>
      </div>
      {rules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring transactions"
          description="Set up income or expenses that repeat, like salary on the 1st or rent every month."
          action={
            <Button onClick={() => openForm()}>
              <Plus /> New schedule
            </Button>
          }
        />
      ) : (
        <SectionCard>
          <ul className="divide-y">
            {rules.map((r) => (
              <RuleRow key={r.id} r={r} pref={pref} onEdit={() => openForm(r)} onDelete={() => setToDelete(r)} />
            ))}
          </ul>
        </SectionCard>
      )}

      <Dialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.editing ? "Edit recurring transaction" : "New recurring transaction"}</DialogTitle>
            <DialogDescription>Recorded automatically on each date. Running twice never creates duplicates.</DialogDescription>
          </DialogHeader>
          <RuleForm key={form.key} data={data} editing={form.editing} onDone={() => setForm((f) => ({ ...f, open: false }))} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              Future occurrences stop. The {toDelete?.postedCount ?? 0} transaction(s) already recorded stay in your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                toDelete &&
                startDelete(async () => {
                  const r = await deleteRecurringAction({ id: toDelete.id });
                  if (r.ok) toast.success("Schedule deleted");
                  else toast.error(r.error);
                  setToDelete(null);
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
