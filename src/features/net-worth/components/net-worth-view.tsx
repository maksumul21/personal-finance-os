"use client";

import { format, parseISO } from "date-fns";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Scale, Tag, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
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
import { formatAxisMoney, formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ManualItemDTO, NetWorthDTO } from "@/server/queries/net-worth.query";
import { archiveManualItemAction, deleteManualItemAction, deleteValuationAction } from "../actions";
import { CATEGORY_LABELS, ManualItemDialog, ValuationDialog } from "./manual-item-dialogs";

type DialogState =
  | { kind: "item"; editing?: ManualItemDTO; itemKind: "ASSET" | "LIABILITY" }
  | { kind: "value"; item: ManualItemDTO }
  | { kind: "delete"; item: ManualItemDTO }
  | null;

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const day = (d: string) => format(parseISO(d), "d MMM yyyy");

function Change({ amount, pct, label, fmt }: { amount: string | null; pct: string | null; label: string; fmt: (v: string) => string }) {
  if (amount === null) return <span>No figure for {label} yet</span>;
  const down = amount.startsWith("-");
  const zero = Number(amount) === 0;
  return (
    <span>
      <span className={cn("tabular font-medium", !zero && (down ? "text-negative" : "text-positive"))}>
        {!zero && !down ? "+" : ""}
        {fmt(amount)}
        {pct !== null && ` (${!zero && !down ? "+" : ""}${pct}%)`}
      </span>{" "}
      vs {label}
    </span>
  );
}

function HistoryChart({ data, currency, pref }: { data: NetWorthDTO["history"]; currency: string; pref: NumberFormatPref }) {
  const [asTable, setAsTable] = useState(false);
  // Numbers are for plotting only; tooltips and the table use the exact decimal strings.
  const plot = data.map((d) => ({ ...d, _v: d.netWorth === null ? null : Number(d.netWorth) }));
  return (
    <SectionCard
      title="Net worth over time"
      description="Month-end values. Accounts at their balance, investments at the prices recorded by then, other items at their latest value."
      actions={
        <button
          onClick={() => setAsTable((t) => !t)}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-pressed={asTable}
        >
          {asTable ? "Chart" : "Table"}
        </button>
      }
    >
      <div className="p-5">
        {asTable ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Month end</th>
                <th className="pb-2 text-right font-medium">Net worth</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((d) => (
                <tr key={d.month}>
                  <td className="py-1.5">{d.label}</td>
                  <td className="tabular py-1.5 text-right">{d.netWorth === null ? "Needs an exchange rate" : formatMoney(d.netWorth, currency, { pref })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-64" role="img" aria-label={`Net worth chart, ${data.length} months. Use the Table button for values.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={plot} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => formatAxisMoney(v, currency, pref)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    const p = active && payload?.[0]?.payload;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="font-medium">{p.label}</p>
                        <p className="tabular">{p.netWorth === null ? "Needs an exchange rate" : formatMoney(p.netWorth, currency, { pref })}</p>
                      </div>
                    );
                  }}
                />
                <Line
                  dataKey="_v"
                  name="Net worth"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
                  activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function ItemRow({ item, fmt, open }: { item: ManualItemDTO; fmt: (v: string, c?: string) => string; open: (d: DialogState) => void }) {
  const [showHistory, setShowHistory] = useState(false);
  const [pending, start] = useTransition();
  return (
    <li className={cn("px-5 py-3", item.isArchived && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.name}</span>
            <Badge variant="secondary" className="text-[10px]">
              {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS]}
            </Badge>
            {item.isArchived && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {item.valueDate ? `Value as of ${day(item.valueDate)}` : "No value yet"}
            {item.notes ? ` · ${item.notes}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular font-semibold">{item.value === null ? "—" : fmt(item.value, item.currency)}</p>
          {item.value !== null && item.baseValue === null && <p className="text-xs text-negative">needs an exchange rate</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${item.name}`} disabled={pending}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => open({ kind: "value", item })}>
              <Tag /> Update value
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open({ kind: "item", editing: item, itemKind: item.kind })}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShowHistory((v) => !v)}>
              <Scale /> {showHistory ? "Hide" : "Show"} history ({item.valuations.length})
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const r = await archiveManualItemAction({ id: item.id, archived: !item.isArchived });
                  if (!r.ok) toast.error(r.error);
                })
              }
            >
              {item.isArchived ? <ArchiveRestore /> : <Archive />} {item.isArchived ? "Restore" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => open({ kind: "delete", item })}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showHistory && (
        <ul className="mt-2 divide-y rounded-lg border text-sm">
          {item.valuations.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-1.5">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{day(v.date)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{v.note}</span>
              <span className="tabular">{fmt(v.value, item.currency)}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete value of ${day(v.date)}`}
                disabled={pending || item.valuations.length <= 1}
                onClick={() =>
                  start(async () => {
                    const r = await deleteValuationAction({ id: v.id });
                    if (!r.ok) toast.error(r.error);
                  })
                }
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

export function NetWorthView({ data, pref }: { data: NetWorthDTO; pref: NumberFormatPref }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, start] = useTransition();
  const fmt = (v: string, c = data.baseCurrency) => formatMoney(v, c, { pref, compactDecimals: true });
  const close = (o: boolean) => !o && setDialog(null);
  const assets = data.items.filter((i) => i.kind === "ASSET");
  const liabilities = data.items.filter((i) => i.kind === "LIABILITY");

  const sideList = (side: "ASSET" | "LIABILITY") => (
    <ul className="divide-y">
      {data.groups
        .filter((g) => g.side === side)
        .map((g) => (
          <li key={g.key} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
            <span>{g.label}</span>
            <span className="tabular font-medium">{fmt(g.amount)}</span>
          </li>
        ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        title="Net worth"
        description="Everything you own minus everything you owe: your accounts, investments at market value, and other assets and debts you record here."
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Net worth"
            icon={Scale}
            value={<span className={cn(data.netWorth.startsWith("-") && "text-negative")}>{fmt(data.netWorth)}</span>}
            hint={
              <span className="flex flex-col gap-0.5">
                <Change amount={data.change.monthAmount} pct={data.change.monthPct} label="last month-end" fmt={fmt} />
                <Change amount={data.change.yearAmount} pct={data.change.yearPct} label="12 months ago" fmt={fmt} />
              </span>
            }
          />
          <KpiCard label="Total assets" value={fmt(data.totalAssets)} hint="Accounts, investments and other assets" />
          <KpiCard
            label="Total liabilities"
            value={fmt(data.totalLiabilities)}
            hint={data.unconvertedCount ? `${data.unconvertedCount} item(s) left out: no exchange rate` : "Cards, loans and other debts"}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Assets">{sideList("ASSET")}</SectionCard>
          <SectionCard title="Liabilities">{sideList("LIABILITY")}</SectionCard>
        </div>

        <HistoryChart data={data.history} currency={data.baseCurrency} pref={pref} />

        <div className="grid gap-6 lg:grid-cols-2">
          {(["ASSET", "LIABILITY"] as const).map((kind) => {
            const list = kind === "ASSET" ? assets : liabilities;
            return (
              <SectionCard
                key={kind}
                title={kind === "ASSET" ? "Other assets" : "Other liabilities"}
                description={kind === "ASSET" ? "Property, vehicles, gold, money lent: things that aren't accounts." : "Money owed outside your loan and card accounts."}
                actions={
                  <Button size="sm" onClick={() => setDialog({ kind: "item", itemKind: kind })}>
                    <Plus /> Add
                  </Button>
                }
              >
                {list.length === 0 ? (
                  <EmptyState
                    className="m-5"
                    icon={Scale}
                    title={kind === "ASSET" ? "No other assets" : "No other liabilities"}
                    description={kind === "ASSET" ? "Add a flat, car or gold with its current value." : "Add money borrowed from family or taxes due."}
                  />
                ) : (
                  <ul className="divide-y">
                    {list.map((i) => (
                      <ItemRow key={i.id} item={i} fmt={fmt} open={setDialog} />
                    ))}
                  </ul>
                )}
              </SectionCard>
            );
          })}
        </div>
      </div>

      {dialog?.kind === "item" && <ManualItemDialog onOpenChange={close} editing={dialog.editing} itemKind={dialog.itemKind} baseCurrency={data.baseCurrency} today={data.today} />}
      {dialog?.kind === "value" && <ValuationDialog onOpenChange={close} item={dialog.item} today={data.today} />}
      <AlertDialog open={dialog?.kind === "delete"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {dialog?.kind === "delete" ? dialog.item.name : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its value history is removed and net worth is recalculated for every month. To keep history, record a value of 0 (sold or settled) or archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (dialog?.kind !== "delete") return;
                start(async () => {
                  const r = await deleteManualItemAction({ id: dialog.item.id });
                  if (!r.ok) toast.error(r.error);
                  else toast.success("Deleted");
                  setDialog(null);
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
