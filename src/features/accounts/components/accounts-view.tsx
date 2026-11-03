"use client";

import { Archive, ArchiveRestore, List, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FinanceIcon } from "@/components/finance/finance-icon";
import { Money } from "@/components/finance/money";
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
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import type { AccountDTO, AccountsOverview } from "@/server/queries/accounts.query";
import { archiveAccountAction, deleteAccountAction } from "../actions";
import { ACCOUNT_TYPE_LABELS, PROVIDER_LABELS } from "../labels";
import { AccountFormDialog, emptyAccountForm, type AccountFormDefaults } from "./account-form-dialog";

function toFormDefaults(a: AccountDTO): AccountFormDefaults {
  const owed = a.nature === "LIABILITY";
  return {
    id: a.id,
    hasTransactions: a.transactionCount > 0,
    values: {
      name: a.name,
      type: a.type,
      provider: (a.provider as AccountFormDefaults["values"]["provider"]) ?? null,
      currency: a.currency as AccountFormDefaults["values"]["currency"],
      // Liabilities are stored negative but entered as a positive "amount owed".
      openingBalance: owed ? a.openingBalance.replace(/^-/, "") : a.openingBalance,
      openingDate: a.openingDate,
      creditLimit: a.creditLimit ?? "",
      color: a.color,
      icon: a.icon,
      description: a.description ?? "",
      includeInSafeToSpend: a.includeInSafeToSpend,
    },
  };
}

function AccountRow({
  account,
  pref,
  baseCurrency,
  onEdit,
  onDelete,
}: {
  account: AccountDTO;
  pref: NumberFormatPref;
  baseCurrency: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const liability = account.nature === "LIABILITY";
  const owed = liability && account.balance.startsWith("-");
  const subtitle = [account.provider ? PROVIDER_LABELS[account.provider] : ACCOUNT_TYPE_LABELS[account.type], account.currency]
    .filter(Boolean)
    .join(" · ");

  const toggleArchive = () =>
    startTransition(async () => {
      const r = await archiveAccountAction({ id: account.id, archived: !account.isArchived });
      if (r.ok) toast.success(account.isArchived ? "Account restored" : "Account archived");
      else toast.error(r.error);
    });

  return (
    <li className="flex items-center gap-3 px-5 py-3.5" aria-busy={pending}>
      <FinanceIcon name={account.icon} color={account.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {account.name}
          {account.isArchived && (
            <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
              Archived
            </Badge>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="text-right">
        {liability ? (
          <>
            <Money
              value={owed ? account.balance.slice(1) : account.balance}
              currency={account.currency}
              pref={pref}
              tone={owed ? "neutral" : "positive"}
              className="text-sm font-semibold"
            />
            <p className="text-xs text-muted-foreground">{owed ? "owed" : "in credit"}</p>
          </>
        ) : (
          <>
            <Money value={account.balance} currency={account.currency} pref={pref} tone="auto" className="text-sm font-semibold" />
            {account.type === "INVESTMENT" && account.value !== account.balance && (
              <p className="tabular text-xs text-muted-foreground">worth {formatMoney(account.value, account.currency, { pref })}</p>
            )}
            {account.currency !== baseCurrency && (
              <p className="tabular text-xs text-muted-foreground">
                {account.baseBalance === null ? "no rate recorded" : `≈ ${formatMoney(account.baseBalance, baseCurrency, { pref })}`}
              </p>
            )}
          </>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${account.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/transactions?account=${account.id}`}>
              <List /> View transactions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleArchive}>
            {account.isArchived ? <ArchiveRestore /> : <Archive />}
            {account.isArchived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          {account.transactionCount === 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function AccountsView({
  overview,
  pref,
  today,
}: {
  overview: AccountsOverview;
  pref: NumberFormatPref;
  today: string;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; defaults: AccountFormDefaults }>({
    open: false,
    defaults: { values: emptyAccountForm(today, overview.baseCurrency) },
  });
  const [toDelete, setToDelete] = useState<AccountDTO | null>(null);
  const [deleting, startDelete] = useTransition();

  const groups = useMemo(() => {
    const active = overview.accounts.filter((a) => !a.isArchived);
    return {
      assets: active.filter((a) => a.nature === "ASSET"),
      liabilities: active.filter((a) => a.nature === "LIABILITY"),
      archived: overview.accounts.filter((a) => a.isArchived),
    };
  }, [overview.accounts]);

  const openCreate = () => setDialog({ open: true, defaults: { values: emptyAccountForm(today, overview.baseCurrency) } });
  const openEdit = (a: AccountDTO) => setDialog({ open: true, defaults: toFormDefaults(a) });

  const confirmDelete = () =>
    startDelete(async () => {
      if (!toDelete) return;
      const r = await deleteAccountAction({ id: toDelete.id });
      if (r.ok) toast.success("Account deleted");
      else toast.error(r.error);
      setToDelete(null);
    });

  const renderList = (list: AccountDTO[]) => (
    <ul className="divide-y">
      {list.map((a) => (
        <AccountRow key={a.id} account={a} pref={pref} baseCurrency={overview.baseCurrency} onEdit={() => openEdit(a)} onDelete={() => setToDelete(a)} />
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Cash, bank, mobile wallets and cards. Balances are calculated from your opening balance and transactions."
        actions={
          <Button onClick={openCreate}>
            <Plus /> Add account
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card shadow-card p-5">
          <p className="text-sm font-medium text-muted-foreground">Total balance</p>
          <Money value={overview.totals.totalBalance} currency={overview.baseCurrency} pref={pref} tone="auto" className="mt-2 block text-2xl font-semibold tracking-tight" />
          <p className="mt-1 text-xs text-muted-foreground">Active asset accounts, excluding credit cards and loans.</p>
        </div>
        <div className="rounded-2xl border bg-card shadow-card p-5">
          <p className="text-sm font-medium text-muted-foreground">Owed on cards &amp; loans</p>
          <Money value={overview.totals.totalLiabilities} currency={overview.baseCurrency} pref={pref} className="mt-2 block text-2xl font-semibold tracking-tight" />
          <p className="mt-1 text-xs text-muted-foreground">Outstanding on active liability accounts.</p>
        </div>
      </div>

      {overview.totals.unconvertedCount > 0 && (
        <p className="mb-6 rounded-lg bg-warning-soft px-4 py-2.5 text-sm">
          {overview.totals.unconvertedCount} account{overview.totals.unconvertedCount > 1 ? "s are" : " is"} in another currency
          with no recorded exchange rate, so not included in the totals.{" "}
          <Link href="/settings" className="font-medium underline">
            Add a rate in Settings
          </Link>
        </p>
      )}

      {overview.accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add where your money lives: cash, bank accounts, bKash or Nagad, and credit cards."
          action={
            <Button onClick={openCreate}>
              <Plus /> Add your first account
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.assets.length > 0 && <SectionCard title="Assets">{renderList(groups.assets)}</SectionCard>}
          {groups.liabilities.length > 0 && (
            <SectionCard title="Credit cards & loans">{renderList(groups.liabilities)}</SectionCard>
          )}
          {groups.archived.length > 0 && (
            <SectionCard title="Archived" description="Kept for history, excluded from totals.">
              {renderList(groups.archived)}
            </SectionCard>
          )}
        </div>
      )}

      <AccountFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        defaults={dialog.defaults}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This account has no transactions, so nothing else is affected. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
