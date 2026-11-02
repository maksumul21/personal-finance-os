"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ScheduleFields } from "@/components/finance/schedule-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { RepeatUnit } from "@/domain/recurrence";
import { formatMoney } from "@/lib/format";
import type { BillDTO, OccurrenceDTO } from "@/server/queries/bills.query";
import type { ComposerData } from "@/server/queries/composer.query";
import { createBillAction, payBillAction, updateBillAction } from "../actions";
import type { BillFormInput } from "../schemas";

export function BillFormDialog({
  open,
  onOpenChange,
  data,
  editing,
  subscription = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: ComposerData;
  editing?: BillDTO;
  subscription?: boolean;
}) {
  const accounts = data.accounts.filter((a) => !a.isArchived || a.id === editing?.paymentAccountId);
  const categories = data.categories.filter((c) => c.kind === "EXPENSE" && (!c.isArchived || c.id === editing?.categoryId));
  const [v, setV] = useState<BillFormInput>(() => ({
    name: editing?.name ?? "",
    amount: editing?.amount ?? "",
    categoryId: editing?.categoryId ?? "",
    paymentAccountId: editing?.paymentAccountId ?? accounts.find((a) => !a.isLiability)?.id ?? "",
    unit: editing ? (editing.unit ?? "ONCE") : "MONTHLY",
    interval: editing?.interval ?? 1,
    firstDueDate: editing?.firstDueDate ?? data.today,
    endDate: editing?.endDate ?? "",
    isSubscription: editing?.isSubscription ?? subscription,
    notes: editing?.notes ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (patch: Partial<BillFormInput>) => setV((s) => ({ ...s, ...patch }));
  const err = (k: string) => (errors[k] ? <p className="text-xs text-negative">{errors[k]}</p> : null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = editing ? await updateBillAction({ id: editing.id, values: v }) : await createBillAction(v);
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, m]) => [k.replace(/^values\./, ""), m[0]])));
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Bill updated" : v.isSubscription ? "Subscription added" : "Bill added");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit bill" : v.isSubscription ? "New subscription" : "New bill"}</DialogTitle>
          <DialogDescription>{editing ? "Changes apply to unpaid dates from today on." : "Paying a bill records it as an expense, once."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="b-name">Name</Label>
              <Input id="b-name" placeholder={v.isSubscription ? "e.g. Netflix" : "e.g. Electricity"} value={v.name} onChange={(e) => set({ name: e.target.value })} />
              {err("name")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-amount">Amount</Label>
              <Input id="b-amount" inputMode="decimal" className="tabular" value={v.amount} onChange={(e) => set({ amount: e.target.value })} />
              {err("amount")}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={v.categoryId} onValueChange={(id) => set({ categoryId: id })}>
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
              {err("categoryId")}
            </div>
            <div className="space-y-2">
              <Label>Paid from</Label>
              <Select value={v.paymentAccountId} onValueChange={(id) => set({ paymentAccountId: id })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.currency !== data.baseCurrency ? ` · ${a.currency}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("paymentAccountId")}
            </div>
          </div>
          <ScheduleFields
            unit={(v.unit === "ONCE" ? "MONTHLY" : v.unit) as RepeatUnit}
            interval={v.interval}
            onChange={(unit, interval) => set({ unit: unit as BillFormInput["unit"], interval })}
            allowOnce
            once={v.unit === "ONCE"}
            onOnceChange={(once) => set({ unit: once ? "ONCE" : "MONTHLY", interval: 1 })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="b-due">{v.unit === "ONCE" ? "Due date" : "First due date"}</Label>
              <Input id="b-due" type="date" value={v.firstDueDate} onChange={(e) => set({ firstDueDate: e.target.value })} />
              {err("firstDueDate")}
            </div>
            {v.unit !== "ONCE" && (
              <div className="space-y-2">
                <Label htmlFor="b-end">Ends (optional)</Label>
                <Input id="b-end" type="date" value={v.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value })} />
                {err("endDate")}
              </div>
            )}
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium">Subscription</span>
              <span className="block text-xs text-muted-foreground">Counted in your monthly and yearly subscription cost.</span>
            </span>
            <Switch checked={v.isSubscription} onCheckedChange={(c) => set({ isSubscription: c })} />
          </label>
          <div className="space-y-2">
            <Label htmlFor="b-notes">Notes (optional)</Label>
            <Textarea id="b-notes" rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PayBillDialog({
  open,
  onOpenChange,
  occurrence,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  occurrence: OccurrenceDTO;
  data: ComposerData;
}) {
  const [date, setDate] = useState(occurrence.dueDate < data.today ? data.today : occurrence.dueDate > data.today ? data.today : occurrence.dueDate);
  const [amount, setAmount] = useState(occurrence.amount);
  const [accountId, setAccountId] = useState("");
  const [alreadyRecorded, setAlreadyRecorded] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const accounts = data.accounts.filter((a) => !a.isArchived);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await payBillAction({ occurrenceId: occurrence.id, date, amount, accountId, alreadyRecorded });
      if (!r.ok) {
        setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.error);
        return;
      }
      toast.success(alreadyRecorded ? "Marked paid" : `Paid: expense of ${formatMoney(amount, occurrence.currency)} recorded`);
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {occurrence.name}</DialogTitle>
          <DialogDescription>
            Due {occurrence.dueDate} · {formatMoney(occurrence.amount, occurrence.currency)} from {occurrence.accountName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium">Already recorded</span>
              <span className="block text-xs text-muted-foreground">I’ve added this expense myself; just mark the bill paid.</span>
            </span>
            <Switch checked={alreadyRecorded} onCheckedChange={setAlreadyRecorded} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-date">Paid on</Label>
              <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {!alreadyRecorded && (
              <div className="space-y-2">
                <Label htmlFor="p-amount">Amount</Label>
                <Input id="p-amount" inputMode="decimal" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            )}
          </div>
          {!alreadyRecorded && (
            <div className="space-y-2">
              <Label>Paid from</Label>
              <Select value={accountId || "default"} onValueChange={(id) => setAccountId(id === "default" ? "" : id)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{occurrence.accountName} (usual)</SelectItem>
                  {accounts
                    .filter((a) => a.name !== occurrence.accountName)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && <p className="text-sm text-negative">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : alreadyRecorded ? "Mark paid" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
