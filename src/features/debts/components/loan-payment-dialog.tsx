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
import type { LoanDTO } from "@/server/queries/debts.query";
import { recordLoanPaymentAction } from "../actions";

/** Records one instalment: principal as a transfer to the loan, interest as an expense. */
export function LoanPaymentDialog({
  open,
  onOpenChange,
  loan,
  accounts,
  today,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loan: LoanDTO & { id: string; terms: NonNullable<LoanDTO["terms"]> };
  accounts: ComposerAccount[];
  today: string;
}) {
  const payers = accounts.filter((a) => !a.isArchived && !a.isLiability && a.type !== "INVESTMENT" && a.currency === loan.currency);
  const [amount, setAmount] = useState(loan.suggestedPayment ?? loan.terms.emiAmount);
  const [interest, setInterest] = useState("");
  const [date, setDate] = useState(loan.nextDue && loan.nextDue <= today ? loan.nextDue : today);
  const [from, setFrom] = useState(loan.terms.paymentAccountId);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await recordLoanPaymentAction({ loanId: loan.id, date, amount, interest, accountId: from === loan.terms.paymentAccountId ? "" : from });
      if (!r.ok) {
        setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.error);
        return;
      }
      toast.success(
        `Payment recorded: ${formatMoney(r.data.principal, loan.currency)} principal, ${formatMoney(r.data.interest, loan.currency)} interest`,
      );
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment · {loan.name}</DialogTitle>
          <DialogDescription>
            Owed {formatMoney(loan.outstanding, loan.currency)}. The principal part is a transfer that reduces the loan; only the interest counts as an expense.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-amount">Amount paid</Label>
              <Input id="p-amount" inputMode="decimal" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-date">Date</Label>
              <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-interest">Interest in this payment (optional)</Label>
            <Input id="p-interest" inputMode="decimal" className="tabular" placeholder="Calculated from the balance" value={interest} onChange={(e) => setInterest(e.target.value)} />
            <p className="text-xs text-muted-foreground">Enter the figure on your lender&apos;s statement if you have it.</p>
          </div>
          <div className="space-y-2">
            <Label>Paid from</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {payers.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
