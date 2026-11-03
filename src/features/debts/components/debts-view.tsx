"use client";

import { format, parseISO } from "date-fns";
import { CalendarClock, CreditCard, HandCoins, Landmark, MoreHorizontal, Pencil, Percent, Plus, Trash2, TrendingDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FinanceIcon } from "@/components/finance/finance-icon";
import { KpiCard } from "@/components/finance/kpi-card";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComposerAccount, ComposerCategory } from "@/server/queries/composer.query";
import type { DebtsDTO, LoanDTO } from "@/server/queries/debts.query";
import { deleteLoanPaymentAction, deleteLoanTermsAction } from "../actions";
import { LoanPaymentDialog } from "./loan-payment-dialog";
import { LoanTermsDialog } from "./loan-terms-dialog";

type WithTerms = LoanDTO & { id: string; terms: NonNullable<LoanDTO["terms"]> };
type DialogState =
  | { kind: "terms"; loan: LoanDTO }
  | { kind: "pay"; loan: WithTerms }
  | { kind: "remove-terms"; loan: WithTerms }
  | { kind: "delete-payment"; loan: WithTerms; paymentId: string; label: string }
  | null;

const day = (d: string) => format(parseISO(d), "d MMM yyyy");
const month = (d: string) => format(parseISO(d), "MMM yyyy");

function LoanCard({ loan, fmt, open }: { loan: LoanDTO; fmt: (v: string, c?: string) => string; open: (d: DialogState) => void }) {
  const [showHistory, setShowHistory] = useState(false);
  const t = loan.terms;
  const paidOff = Number(loan.outstanding) === 0;
  const pct = loan.repaidPct === null ? 0 : Math.min(100, Math.max(0, Number(loan.repaidPct)));

  return (
    <li className="rounded-xl border bg-card">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <FinanceIcon name={loan.icon} color={loan.color} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-medium">{loan.name}</h3>
              {paidOff && <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-medium text-positive">Paid off</span>}
              {!paidOff && loan.overdue && (
                <span className="rounded-full bg-negative-soft px-2 py-0.5 text-[11px] font-medium text-negative">Payment overdue</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t ? `${t.annualRate}% a year · ${t.termMonths} months · paid from ${t.paymentAccountName}` : "No loan details yet"}
            </p>
          </div>
          {t && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Options for ${loan.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => open({ kind: "terms", loan })}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/transactions?account=${loan.accountId}`}>View transactions</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => open({ kind: "remove-terms", loan: loan as WithTerms })}>
                  <Trash2 /> Remove details
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <p className="tabular text-xl font-semibold tracking-tight">{fmt(loan.outstanding, loan.currency)}</p>
          <p className="text-sm text-muted-foreground">{t ? `owed of ${fmt(t.principal, loan.currency)}` : "owed"}</p>
        </div>

        {t ? (
          <>
            <div
              role="progressbar"
              aria-label={`${loan.name} repaid`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: loan.color }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Repaid</dt>
                <dd className="tabular font-medium">{loan.repaidPct ?? "—"}%</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">EMI</dt>
                <dd className="tabular font-medium">{fmt(t.emiAmount, loan.currency)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Next due</dt>
                <dd className={cn("font-medium", loan.overdue && "text-negative")}>{loan.nextDue ? day(loan.nextDue) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Paid off by</dt>
                <dd className="font-medium">
                  {paidOff ? "Done" : loan.payoffDate ? month(loan.payoffDate) : <span className="text-negative">EMI too low</span>}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Interest paid</dt>
                <dd className="tabular font-medium">{fmt(loan.interestPaid, loan.currency)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Interest still to pay</dt>
                <dd className="tabular font-medium">{loan.remainingInterest === null ? "—" : fmt(loan.remainingInterest, loan.currency)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Months left</dt>
                <dd className="tabular font-medium">{loan.remainingMonths ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {!paidOff && (
                <Button size="sm" onClick={() => open({ kind: "pay", loan: loan as WithTerms })}>
                  <HandCoins /> Record payment
                </Button>
              )}
              {loan.payments.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
                  {showHistory ? "Hide" : "Show"} payments ({loan.payments.length})
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-4">
            <Button size="sm" onClick={() => open({ kind: "terms", loan })}>
              <Plus /> Add loan details
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Add the rate and term to split payments into principal and interest and see your payoff date.</p>
          </div>
        )}
      </div>

      {showHistory && t && (
        <ul className="divide-y border-t text-sm">
          {loan.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{day(p.date)}</span>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                Principal <span className="tabular text-foreground">{fmt(p.principal, loan.currency)}</span> · Interest{" "}
                <span className="tabular text-foreground">{fmt(p.interest, loan.currency)}</span>
              </span>
              <span className="tabular font-medium">{fmt(p.total, loan.currency)}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete payment of ${day(p.date)}`}
                onClick={() => open({ kind: "delete-payment", loan: loan as WithTerms, paymentId: p.id, label: day(p.date) })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PayoffPlanner({ data, fmt }: { data: NonNullable<DebtsDTO["payoff"]>; fmt: (v: string) => string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [extra, setExtra] = useState(Number(data.extra) ? data.extra : "");
  const [pending, start] = useTransition();
  const [avalanche, snowball] = data.plans;
  const saving = Number(snowball.totalInterest) - Number(avalanche.totalInterest);

  return (
    <SectionCard
      title="Payoff planner"
      description="Pay every minimum, then put the extra on one loan at a time. Credit cards aren't included because no rate is recorded for them."
    >
      <form
        className="flex flex-wrap items-end gap-3 border-b px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = extra.replace(/[,\s৳]/g, "");
          start(() => router.replace(clean && Number(clean) > 0 ? `${pathname}?extra=${encodeURIComponent(clean)}` : pathname, { scroll: false }));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="extra">Extra each month</Label>
          <Input id="extra" inputMode="decimal" className="tabular w-40" placeholder="0" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Calculating…" : "Compare"}
        </Button>
        <Link href="/what-if" className="text-xs text-primary hover:underline">
          What if I pay extra on one loan?
        </Link>
        {data.excludedCount > 0 && (
          <p className="text-xs text-muted-foreground">{data.excludedCount} loan(s) left out: no details, paid off or another currency.</p>
        )}
      </form>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {data.plans.map((p) => (
          <div key={p.strategy} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{p.strategy === "AVALANCHE" ? "Avalanche" : "Snowball"}</h3>
              <span className="text-xs text-muted-foreground">{p.strategy === "AVALANCHE" ? "Highest rate first" : "Smallest balance first"}</span>
            </div>
            <p className="mt-3 text-sm">
              {p.months === null ? (
                <span className="text-negative">Not paid off within 50 years at these payments.</span>
              ) : (
                <>
                  Debt-free in <span className="tabular font-semibold">{p.months}</span> months · interest{" "}
                  <span className="tabular font-semibold">{fmt(p.totalInterest)}</span>
                </>
              )}
            </p>
            <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
              {p.order.map((o, i) => (
                <li key={o.accountId}>
                  {i + 1}. {o.name} — month {o.month}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {avalanche.months !== null && snowball.months !== null && (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          {saving > 0.005
            ? `Avalanche saves ${fmt(saving.toFixed(2))} in interest. Snowball clears individual loans sooner, which some people find motivating.`
            : "Both orders cost the same interest for these loans."}
        </p>
      )}
    </SectionCard>
  );
}

export function DebtsView({
  data,
  accounts,
  categories,
  pref,
  today,
}: {
  data: DebtsDTO;
  accounts: ComposerAccount[];
  categories: ComposerCategory[];
  pref: NumberFormatPref;
  today: string;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, start] = useTransition();
  const fmt = (v: string, c = data.baseCurrency) => formatMoney(v, c, { pref, compactDecimals: true });
  const close = (o: boolean) => !o && setDialog(null);
  const hasDebt = data.loans.length + data.cards.length > 0;

  const confirm = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else toast.success(success);
      setDialog(null);
    });

  return (
    <>
      <PageHeader
        title="Debt management"
        description="Loans and credit cards. Repaying principal is a transfer that reduces what you owe; only interest counts as spending."
        actions={
          <Button asChild variant="outline">
            <Link href="/accounts">
              <Plus /> Add loan or card account
            </Link>
          </Button>
        }
      />

      {!hasDebt ? (
        <EmptyState
          icon={Landmark}
          title="No loans or credit cards"
          description="Add a Loan or Credit card account with what you owe today. Then add the loan's rate and term here to track payoff."
          action={
            <Button asChild>
              <Link href="/accounts">Go to accounts</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Total owed"
              icon={TrendingDown}
              value={fmt(data.totals.totalOwed)}
              hint={data.totals.unconvertedCount ? `${data.totals.unconvertedCount} account(s) need an exchange rate` : "Loans and cards, active accounts"}
            />
            <KpiCard label="Monthly EMIs" icon={CalendarClock} value={fmt(data.totals.monthlyEmi)} hint={`Loans with details, in ${data.baseCurrency}`} />
            <KpiCard label="Interest paid" icon={Percent} value={fmt(data.totals.interestPaid)} hint="Recorded loan payments" />
          </div>

          {data.loans.length > 0 && (
            <section aria-labelledby="loans-h">
              <h2 id="loans-h" className="mb-3 text-sm font-semibold">
                Loans
              </h2>
              <ul className="grid gap-4 lg:grid-cols-2">
                {data.loans.map((l) => (
                  <LoanCard key={l.accountId} loan={l} fmt={fmt} open={setDialog} />
                ))}
              </ul>
            </section>
          )}

          {data.cards.length > 0 && (
            <SectionCard title="Credit cards" description="Purchases are expenses on the card; paying the bill is a transfer from your bank.">
              <ul className="divide-y">
                {data.cards.map((c) => {
                  const pct = c.utilizationPct === null ? null : Number(c.utilizationPct);
                  return (
                    <li key={c.accountId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                      <CreditCard className="size-4 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.creditLimit ? `Limit ${fmt(c.creditLimit, c.currency)}` : "No limit set"}
                        {pct !== null && (
                          <Badge variant="secondary" className={cn("ml-2 text-[10px]", pct >= 30 && "bg-warning-soft text-foreground")}>
                            {c.utilizationPct}% used
                          </Badge>
                        )}
                      </span>
                      <span className="tabular w-28 text-right font-medium">{fmt(c.outstanding, c.currency)}</span>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}

          {data.payoff && <PayoffPlanner data={data.payoff} fmt={fmt} />}
        </div>
      )}

      {dialog?.kind === "terms" && (
        <LoanTermsDialog open onOpenChange={close} loan={dialog.loan} accounts={accounts} categories={categories} today={today} />
      )}
      {dialog?.kind === "pay" && <LoanPaymentDialog open onOpenChange={close} loan={dialog.loan} accounts={accounts} today={today} />}
      <AlertDialog open={dialog?.kind === "remove-terms" || dialog?.kind === "delete-payment"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.kind === "remove-terms" ? "Remove loan details?" : `Delete the ${dialog?.kind === "delete-payment" ? dialog.label : ""} payment?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.kind === "remove-terms"
                ? "The rate, term and payment records are removed. Transfers and interest expenses already recorded stay in your transactions."
                : "Both parts are removed: the principal transfer and the interest expense. Your balances go back to before the payment."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (dialog?.kind === "remove-terms") confirm(() => deleteLoanTermsAction({ id: dialog.loan.id }), "Loan details removed");
                if (dialog?.kind === "delete-payment") confirm(() => deleteLoanPaymentAction({ id: dialog.paymentId }), "Payment deleted");
              }}
            >
              {dialog?.kind === "remove-terms" ? "Remove" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
