"use client";

import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Receipt,
  SkipForward,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
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
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BillDTO, OccurrenceDTO } from "@/server/queries/bills.query";
import type { ComposerData } from "@/server/queries/composer.query";
import { deleteBillAction, setBillStatusAction, skipBillAction, unpayBillAction } from "../actions";
import { BillFormDialog, PayBillDialog } from "./bill-dialogs";
import { BILL_STATUS, StatusLabel } from "./bill-status";

function OccurrenceRow({ o, fmt, onPay }: { o: OccurrenceDTO; fmt: (v: string, c: string) => string; onPay: () => void }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(msg);
      else toast.error((r as { error: string }).error);
    });
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5" aria-busy={pending}>
      <div className="w-12 shrink-0 text-center">
        <p className="text-[11px] text-muted-foreground uppercase">{format(parseISO(o.dueDate), "MMM")}</p>
        <p className="tabular text-lg leading-tight font-semibold">{format(parseISO(o.dueDate), "d")}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {o.name}
          {o.isSubscription && <span className="ml-2 text-xs font-normal text-muted-foreground">subscription</span>}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <StatusLabel status={o.status} />
          <span>· {o.accountName}</span>
          {o.status === "PAID" && o.paidAt && <span>· paid {format(parseISO(o.paidAt), "d MMM")}</span>}
        </p>
      </div>
      <span className="tabular text-sm font-semibold">{fmt(o.amount, o.currency)}</span>
      {o.status === "PAID" ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => unpayBillAction({ occurrenceId: o.id }), o.transactionId ? "Payment undone and expense removed" : "Marked unpaid")}>
          <Undo2 /> Undo
        </Button>
      ) : o.status === "SKIPPED" ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => skipBillAction({ occurrenceId: o.id, skipped: false }), "Restored")}>
          <Undo2 /> Restore
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={onPay}>
            Pay
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More for ${o.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => run(() => skipBillAction({ occurrenceId: o.id, skipped: true }), "Skipped this time")}>
                <SkipForward /> Skip this one
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  );
}

function Calendar({
  month,
  occurrences,
  weekStartsOn,
  today,
  fmt,
  onPay,
}: {
  month: string;
  occurrences: OccurrenceDTO[];
  weekStartsOn: number;
  today: string;
  fmt: (v: string, c: string) => string;
  onPay: (o: OccurrenceDTO) => void;
}) {
  const first = parseISO(`${month}-01`);
  const opts = { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(first), opts), end: endOfWeek(endOfMonth(first), opts) });
  const byDay = new Map<string, OccurrenceDTO[]>();
  for (const o of occurrences) byDay.set(o.dueDate, [...(byDay.get(o.dueDate) ?? []), o]);
  const prev = format(addMonths(first, -1), "yyyy-MM");
  const next = format(addMonths(first, 1), "yyyy-MM");

  return (
    <SectionCard
      title={format(first, "MMMM yyyy")}
      description="Bill calendar"
      actions={
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Previous month">
            <Link href={`/bills?month=${prev}`} scroll={false}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/bills" scroll={false}>
              Today
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Next month">
            <Link href={`/bills?month=${next}`} scroll={false}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      }
    >
      {/* Grid on wider screens */}
      <div className="hidden p-3 md:block">
        <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground">
          {days.slice(0, 7).map((d) => (
            <div key={d.toISOString()} className="pb-2">
              {format(d, "EEE")}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const items = byDay.get(key) ?? [];
            const inMonth = isSameMonth(d, first);
            return (
              <div key={key} className={cn("min-h-24 bg-card p-1.5", !inMonth && "bg-muted/40")}>
                <p
                  className={cn(
                    "tabular mb-1 grid size-6 place-items-center rounded-full text-xs",
                    key === today ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {format(d, "d")}
                </p>
                <ul className="space-y-1">
                  {items.map((o) => {
                    const m = BILL_STATUS[o.status];
                    const Icon = m.icon;
                    return (
                      <li key={o.id}>
                        <button
                          onClick={() => o.status !== "PAID" && o.status !== "SKIPPED" && onPay(o)}
                          className={cn("flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px]", m.chip)}
                          title={`${o.name} · ${fmt(o.amount, o.currency)} · ${m.label}`}
                        >
                          <Icon className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{o.name}</span>
                          <span className="sr-only">, {m.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      {/* Agenda on phones */}
      <div className="md:hidden">
        {occurrences.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No bills this month.</p>
        ) : (
          <ul className="divide-y">
            {occurrences.map((o) => (
              <OccurrenceRow key={o.id} o={o} fmt={fmt} onPay={() => onPay(o)} />
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

function BillRow({ b, fmt, onEdit, onDelete }: { b: BillDTO; fmt: (v: string, c: string) => string; onEdit: () => void; onDelete: () => void }) {
  const [pending, start] = useTransition();
  const status = (s: "ACTIVE" | "PAUSED" | "CANCELLED", msg: string) =>
    start(async () => {
      const r = await setBillStatusAction({ id: b.id, status: s });
      if (r.ok) toast.success(msg);
      else toast.error(r.error);
    });
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", b.status !== "ACTIVE" && "opacity-70")} aria-busy={pending}>
      <FinanceIcon name={b.categoryIcon} color={b.categoryColor} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {b.name}
          {b.status === "PAUSED" && <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
          {b.status === "CANCELLED" && <Badge variant="outline" className="text-[10px]">Cancelled</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {b.schedule} · {b.categoryName} · {b.paymentAccountName}
          {b.next && b.status === "ACTIVE" ? ` · next ${format(parseISO(b.next.dueDate), "d MMM")}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="tabular text-sm font-semibold">{fmt(b.amount, b.currency)}</p>
        {b.isSubscription && b.unit && b.unit !== "MONTHLY" && (
          <p className="tabular text-xs text-muted-foreground">{fmt(b.monthlyCost, b.currency)}/mo</p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${b.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {b.status === "ACTIVE" && (
            <DropdownMenuItem onSelect={() => status("PAUSED", "Paused")}>
              <Pause /> Pause
            </DropdownMenuItem>
          )}
          {b.status !== "ACTIVE" && (
            <DropdownMenuItem onSelect={() => status("ACTIVE", "Active again")}>
              <Play /> {b.status === "CANCELLED" ? "Reactivate" : "Resume"}
            </DropdownMenuItem>
          )}
          {b.status !== "CANCELLED" && (
            <DropdownMenuItem onSelect={() => status("CANCELLED", b.isSubscription ? "Subscription cancelled" : "Bill cancelled")}>
              <Ban /> Cancel
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

export function BillsView({
  bills,
  upcoming,
  month,
  monthOccurrences,
  subscriptions,
  data,
  pref,
  weekStartsOn,
}: {
  bills: BillDTO[];
  upcoming: { items: OccurrenceDTO[]; overdueCount: number; total: string | null };
  month: string;
  monthOccurrences: OccurrenceDTO[];
  subscriptions: { count: number; monthly: string; annual: string; otherCurrencyCount: number };
  data: ComposerData;
  pref: NumberFormatPref;
  weekStartsOn: number;
}) {
  const [form, setForm] = useState<{ open: boolean; editing?: BillDTO; subscription?: boolean; key: number }>({ open: false, key: 0 });
  const [paying, setPaying] = useState<OccurrenceDTO | null>(null);
  const [toDelete, setToDelete] = useState<BillDTO | null>(null);
  const [deleting, startDelete] = useTransition();
  const fmt = (v: string, c: string) => formatMoney(v, c, { pref, compactDecimals: true });
  const openForm = (o: { editing?: BillDTO; subscription?: boolean } = {}) => setForm((f) => ({ open: true, ...o, key: f.key + 1 }));
  const subs = bills.filter((b) => b.isSubscription);
  const regular = bills.filter((b) => !b.isSubscription);

  return (
    <>
      <PageHeader
        title="Bills & subscriptions"
        description="Paying a bill records the expense once. Overdue and upcoming bills also show on your dashboard."
        actions={
          <>
            <Button variant="outline" onClick={() => openForm({ subscription: true })}>
              <Plus /> Subscription
            </Button>
            <Button onClick={() => openForm()}>
              <Plus /> Bill
            </Button>
          </>
        }
      />

      {bills.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No bills yet"
          description="Add rent, utilities, internet, insurance or subscriptions like Netflix to see what's due and never pay twice."
          action={
            <Button onClick={() => openForm()}>
              <Plus /> Add a bill
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-5">
            <SectionCard
              className="lg:col-span-3"
              title="Due soon"
              description={
                upcoming.items.length === 0
                  ? "Nothing due in the next 30 days"
                  : `${upcoming.items.length} unpaid${upcoming.overdueCount ? `, ${upcoming.overdueCount} overdue` : ""}${
                      upcoming.total ? ` · ${fmt(upcoming.total, upcoming.items[0].currency)} total` : ""
                    }`
              }
            >
              {upcoming.items.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">You’re all caught up.</p>
              ) : (
                <ul className="divide-y">
                  {upcoming.items.map((o) => (
                    <OccurrenceRow key={o.id} o={o} fmt={fmt} onPay={() => setPaying(o)} />
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard className="lg:col-span-2" title="Subscriptions" description={`${subscriptions.count} active`}>
              <dl className="grid grid-cols-2 gap-4 p-5">
                <div>
                  <dt className="text-xs text-muted-foreground">Per month</dt>
                  <dd className="tabular mt-1 text-xl font-semibold">{fmt(subscriptions.monthly, data.baseCurrency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Per year</dt>
                  <dd className="tabular mt-1 text-xl font-semibold">{fmt(subscriptions.annual, data.baseCurrency)}</dd>
                </div>
              </dl>
              <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                Yearly and weekly plans are converted to an average month.
                {subscriptions.otherCurrencyCount > 0 && ` ${subscriptions.otherCurrencyCount} in other currencies aren't included.`}
              </p>
            </SectionCard>
          </div>

          <Calendar month={month} occurrences={monthOccurrences} weekStartsOn={weekStartsOn} today={data.today} fmt={fmt} onPay={setPaying} />

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Bills" description="Rent, utilities, insurance and other obligations">
              {regular.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">No bills.</p>
              ) : (
                <ul className="divide-y">
                  {regular.map((b) => (
                    <BillRow key={b.id} b={b} fmt={fmt} onEdit={() => openForm({ editing: b })} onDelete={() => setToDelete(b)} />
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Subscription list" description="Streaming, software, domains and hosting">
              {subs.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">No subscriptions.</p>
              ) : (
                <ul className="divide-y">
                  {subs.map((b) => (
                    <BillRow key={b.id} b={b} fmt={fmt} onEdit={() => openForm({ editing: b })} onDelete={() => setToDelete(b)} />
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {form.open && (
        <BillFormDialog
          key={form.key}
          open
          onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
          data={data}
          editing={form.editing}
          subscription={form.subscription}
        />
      )}
      {paying && <PayBillDialog key={paying.id} open onOpenChange={(o) => !o && setPaying(null)} occurrence={paying} data={data} />}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its schedule and payment history are removed. Expenses already recorded for it stay in your transactions. To stop it
              but keep the history, cancel it instead.
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
                  const r = await deleteBillAction({ id: toDelete.id });
                  if (r.ok) toast.success("Deleted");
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
