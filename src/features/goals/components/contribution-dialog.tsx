"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import type { ComposerAccount } from "@/server/queries/composer.query";
import type { ContributionDTO, GoalDTO } from "@/server/queries/goals.query";
import { addContributionAction, updateContributionAction } from "../actions";

const NO_MOVE = "none";

/** Add money / withdraw, or edit an existing contribution's amount, date and notes. */
export function ContributionDialog({
  open,
  onOpenChange,
  goal,
  direction,
  editing,
  accounts,
  today,
  currency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal: GoalDTO;
  direction: "DEPOSIT" | "WITHDRAWAL";
  editing?: ContributionDTO;
  accounts: ComposerAccount[];
  today: string;
  currency: string;
}) {
  const others = accounts.filter((a) => !a.isArchived && !a.isLiability && a.id !== goal.linkedAccount?.id);
  const [amount, setAmount] = useState(editing?.amount ?? (direction === "DEPOSIT" && goal.requiredMonthly ? goal.requiredMonthly : ""));
  const [date, setDate] = useState(editing?.date ?? today);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [accountId, setAccountId] = useState(goal.linkedAccount && others[0] ? others[0].id : NO_MOVE);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const deposit = (editing?.direction ?? direction) === "DEPOSIT";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = editing
        ? await updateContributionAction({ id: editing.id, amount, date, notes })
        : await addContributionAction({ goalId: goal.id, direction, amount, date, notes, accountId: accountId === NO_MOVE ? "" : accountId });
      if (!r.ok) {
        setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.error);
        return;
      }
      toast.success(editing ? "Contribution updated" : deposit ? "Money added" : "Money withdrawn");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit contribution" : deposit ? `Add to ${goal.name}` : `Withdraw from ${goal.name}`}</DialogTitle>
          <DialogDescription>
            {deposit
              ? `Saved ${formatMoney(goal.saved, currency, { compactDecimals: true })} of ${formatMoney(goal.target, currency, { compactDecimals: true })}.`
              : `Available to withdraw: ${formatMoney(goal.saved, currency, { compactDecimals: true })}.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="c-amount">Amount</Label>
              <Input id="c-amount" inputMode="decimal" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-date">Date</Label>
              <Input id="c-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {!editing && (
            <div className="space-y-2">
              <Label>{deposit ? "Money comes from" : "Money goes to"}</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={!goal.linkedAccount}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {others.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NO_MOVE}>
                    {deposit ? "Already set aside: don't move money" : "Keep it where it is: don't move money"}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {!goal.linkedAccount
                  ? "This goal isn't linked to an account, so this only records the amount set aside."
                  : accountId === NO_MOVE
                    ? "Only the goal's progress changes. No transaction is created."
                    : deposit
                      ? `Records a transfer into ${goal.linkedAccount.name}. Transfers are never counted as expenses.`
                      : `Records a transfer out of ${goal.linkedAccount.name}.`}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="c-notes">Notes (optional)</Label>
            <Input id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save" : deposit ? "Add money" : "Withdraw"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
