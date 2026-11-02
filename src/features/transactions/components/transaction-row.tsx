"use client";

import { ArrowLeftRight, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FinanceIcon } from "@/components/finance/finance-icon";
import { Money } from "@/components/finance/money";
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
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import type { TransactionDTO } from "@/server/queries/transactions.query";
import { deleteTransactionAction } from "../actions";
import { useComposer } from "./composer";

export function transactionTitle(t: TransactionDTO) {
  if (t.description) return t.description;
  if (t.type === "TRANSFER") return t.toAccount ? `Transfer to ${t.toAccount.name}` : "Transfer";
  return t.category?.name ?? "Transaction";
}

/** Income green with "+", expenses neutral with "−", transfers neutral. Red is never used here. */
function AmountCell({ t, pref }: { t: TransactionDTO; pref: NumberFormatPref }) {
  const sign = t.type === "INCOME" || t.isRefund ? "" : t.type === "EXPENSE" ? "-" : "";
  return (
    <div className="text-right">
      <Money
        value={`${sign}${t.amount}`}
        currency={t.currency}
        pref={pref}
        signed={t.type === "INCOME" || t.isRefund}
        tone={t.type === "INCOME" || t.isRefund ? "positive" : "neutral"}
        className="text-sm font-semibold"
      />
      {t.type === "TRANSFER" && t.toAmount && t.toAccount && t.toAccount.currency !== t.currency && (
        <p className="tabular text-xs text-muted-foreground">→ {formatMoney(t.toAmount, t.toAccount.currency, { pref })}</p>
      )}
      {t.isRefund && <p className="text-xs text-muted-foreground">refund</p>}
    </div>
  );
}

export function TransactionRow({
  t,
  pref,
  showDate = false,
  dateLabel,
  actions = true,
}: {
  t: TransactionDTO;
  pref: NumberFormatPref;
  showDate?: boolean;
  dateLabel?: string;
  actions?: boolean;
}) {
  const composer = useComposer();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  const subtitle =
    t.type === "TRANSFER"
      ? `${t.account.name} → ${t.toAccount?.name ?? ""}`
      : [t.category && t.description ? t.category.name : null, t.account.name].filter(Boolean).join(" · ");

  const remove = () =>
    startTransition(async () => {
      const r = await deleteTransactionAction({ id: t.id });
      if (r.ok) toast.success("Transaction deleted");
      else toast.error(r.error);
      setConfirm(false);
    });

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5" aria-busy={pending}>
      {t.type === "TRANSFER" ? (
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ArrowLeftRight className="size-4" />
        </span>
      ) : (
        <FinanceIcon name={t.category?.icon ?? "tag"} color={t.category?.color} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{transactionTitle(t)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {showDate && dateLabel ? `${dateLabel} · ` : ""}
          {subtitle}
        </p>
        {t.tags.length > 0 && (
          <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
            {t.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <AmountCell t={t} pref={pref} />
      {actions && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${transactionTitle(t)}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => composer.open({ edit: t })}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => composer.open({ copy: t })}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{transactionTitle(t)}” for {formatMoney(t.amount, t.currency, { pref })} will be removed and account balances
                  recalculated. This can’t be undone.
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
      )}
    </li>
  );
}
