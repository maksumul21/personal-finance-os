"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { emi } from "@/domain/loans";
import { formatMoney } from "@/lib/format";
import type { ComposerAccount, ComposerCategory } from "@/server/queries/composer.query";
import type { LoanDTO } from "@/server/queries/debts.query";
import { saveLoanTermsAction } from "../actions";

/** The EMI the server would compute, shown live; null while inputs are incomplete. */
function previewEmi(principal: string, rate: string, months: string): string | null {
  try {
    const n = Number(months);
    if (!/^\d+(\.\d{1,2})?$/.test(principal.replace(/,/g, "")) || !/^\d+(\.\d+)?$/.test(rate) || !Number.isInteger(n)) return null;
    return emi(principal.replace(/,/g, ""), rate, n).toFixed(2);
  } catch {
    return null;
  }
}

export function LoanTermsDialog({
  open,
  onOpenChange,
  loan,
  accounts,
  categories,
  today,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loan: LoanDTO;
  accounts: ComposerAccount[];
  categories: ComposerCategory[];
  today: string;
}) {
  const payers = accounts.filter((a) => !a.isArchived && !a.isLiability && a.type !== "INVESTMENT" && a.currency === loan.currency);
  const expenseCats = categories.filter((c) => c.kind === "EXPENSE" && !c.isArchived);
  const t = loan.terms;
  const [principal, setPrincipal] = useState(t?.principal ?? loan.outstanding);
  const [rate, setRate] = useState(t?.annualRate ?? "");
  const [months, setMonths] = useState(t ? String(t.termMonths) : "");
  const [first, setFirst] = useState(t?.firstPaymentDate ?? today);
  const [emiOverride, setEmiOverride] = useState(t?.emiAmount ?? "");
  const [payFrom, setPayFrom] = useState(t?.paymentAccountId ?? payers[0]?.id ?? "");
  const [category, setCategory] = useState(t?.interestCategoryId ?? expenseCats.find((c) => c.name === "Loan Payments")?.id ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const computed = previewEmi(principal, rate, months);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveLoanTermsAction({
        accountId: loan.accountId,
        principal,
        annualRate: rate,
        termMonths: Number(months),
        firstPaymentDate: first,
        emiAmount: emiOverride,
        paymentAccountId: payFrom,
        interestCategoryId: category,
      });
      if (!r.ok) {
        const fe = Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v[0]]));
        setErrors(Object.keys(fe).length ? fe : { _: r.error });
        return;
      }
      toast.success("Loan details saved");
      onOpenChange(false);
    });
  };

  const err = (k: string) => errors[k] && <p className="text-xs text-negative">{errors[k]}</p>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t ? "Edit loan details" : "Add loan details"} · {loan.name}</DialogTitle>
          <DialogDescription>
            What you owe always comes from the account balance ({formatMoney(loan.outstanding, loan.currency)} now). These details split each payment into principal and interest.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="l-principal">Amount borrowed</Label>
              <Input id="l-principal" inputMode="decimal" className="tabular" value={principal} onChange={(e) => setPrincipal(e.target.value)} aria-invalid={!!errors.principal} />
              {err("principal")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-rate">Interest % a year</Label>
              <Input id="l-rate" inputMode="decimal" className="tabular" placeholder="9.5" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!!errors.annualRate} />
              {err("annualRate")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-months">Term (months)</Label>
              <Input id="l-months" inputMode="numeric" className="tabular" placeholder="60" value={months} onChange={(e) => setMonths(e.target.value)} aria-invalid={!!errors.termMonths} />
              {err("termMonths")}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="l-first">First instalment</Label>
              <Input id="l-first" type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
              {err("firstPaymentDate")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-emi">Monthly instalment (EMI)</Label>
              <Input
                id="l-emi"
                inputMode="decimal"
                className="tabular"
                placeholder={computed ?? "Calculated"}
                value={emiOverride}
                onChange={(e) => setEmiOverride(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {computed ? `Calculated: ${formatMoney(computed, loan.currency)}. Leave blank to use it, or enter your lender's figure.` : "Leave blank to calculate."}
              </p>
              {err("emiAmount")}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Paid from</Label>
              <Select value={payFrom} onValueChange={setPayFrom}>
                <SelectTrigger className="w-full" aria-invalid={!!errors.paymentAccountId}>
                  <SelectValue placeholder={`A ${loan.currency} account`} />
                </SelectTrigger>
                <SelectContent>
                  {payers.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("paymentAccountId")}
            </div>
            <div className="space-y-2">
              <Label>Interest category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full" aria-invalid={!!errors.interestCategoryId}>
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.group ? `${c.group} › ${c.name}` : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("interestCategoryId")}
            </div>
          </div>
          {errors._ && <p className="text-sm text-negative">{errors._}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save details"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
