"use client";

import { format, parseISO } from "date-fns";
import { ArrowDownToLine, ArrowUpFromLine, Coins, LineChart, MoreHorizontal, Pencil, Plus, Tag, Trash2, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
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
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HoldingDTO, InvestmentAccountDTO, InvestmentsDTO } from "@/server/queries/investments.query";
import { deleteHoldingAction, deleteTradeAction } from "../actions";
import { ASSET_CLASS_LABELS, HoldingDialog, PriceDialog, TradeDialog } from "./investment-dialogs";

type DialogState =
  | { kind: "holding"; account: InvestmentAccountDTO; editing?: HoldingDTO }
  | { kind: "trade"; account: InvestmentAccountDTO; holding: HoldingDTO; side: "BUY" | "SELL" }
  | { kind: "price"; account: InvestmentAccountDTO; holding: HoldingDTO }
  | { kind: "delete-holding"; holding: HoldingDTO }
  | { kind: "delete-trade"; tradeId: string; label: string }
  | null;

/** Prices older than this are flagged, so stale values are visible. */
const STALE_DAYS = 30;
const day = (d: string) => format(parseISO(d), "d MMM yyyy");

function Gain({ value, pct, fmt }: { value: string; pct?: string | null; fmt: (v: string) => string }) {
  const n = value.trim().startsWith("-") ? "negative" : Number(value) === 0 ? "neutral" : "positive";
  return (
    <span className={cn("tabular font-medium", n === "positive" && "text-positive", n === "negative" && "text-negative")}>
      {n === "positive" ? "+" : ""}
      {fmt(value)}
      {pct != null && <span className="ml-1 text-xs font-normal">({n === "positive" ? "+" : ""}{pct}%)</span>}
    </span>
  );
}

function HoldingRow({ h, account, fmt, open }: { h: HoldingDTO; account: InvestmentAccountDTO; fmt: (v: string) => string; open: (d: DialogState) => void }) {
  const [showTrades, setShowTrades] = useState(false);
  const held = Number(h.units) > 0;
  const stale = h.priceAgeDays !== null && h.priceAgeDays > STALE_DAYS;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{h.name}</span>
            {h.symbol && <span className="text-xs text-muted-foreground">{h.symbol}</span>}
            <Badge variant="secondary" className="text-[10px]">
              {ASSET_CLASS_LABELS[h.assetClass as keyof typeof ASSET_CLASS_LABELS]}
            </Badge>
            {held && h.price === null && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px]">No price: valued at cost</span>}
            {held && stale && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px]">Price {h.priceAgeDays} days old</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {h.units} units{h.averageCost ? ` · avg cost ${fmt(h.averageCost)}` : ""}
            {h.price ? ` · price ${fmt(h.price)} on ${day(h.priceDate!)}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular font-semibold">{fmt(h.marketValue)}</p>
          {held && (
            <p className="text-xs">
              <Gain value={h.unrealized} pct={h.unrealizedPct} fmt={fmt} />
            </p>
          )}
          {Number(h.realized) !== 0 && (
            <p className="text-xs text-muted-foreground">
              Realised <Gain value={h.realized} fmt={fmt} />
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Options for ${h.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => open({ kind: "trade", account, holding: h, side: "BUY" })}>
              <ArrowDownToLine /> Buy
            </DropdownMenuItem>
            {held && (
              <DropdownMenuItem onSelect={() => open({ kind: "trade", account, holding: h, side: "SELL" })}>
                <ArrowUpFromLine /> Sell
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => open({ kind: "price", account, holding: h })}>
              <Tag /> Update price
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open({ kind: "holding", account, editing: h })}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => open({ kind: "delete-holding", holding: h })}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => open({ kind: "price", account, holding: h })}>
          <Tag /> Update price
        </Button>
        {h.trades.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowTrades((v) => !v)} aria-expanded={showTrades}>
            {showTrades ? "Hide" : "Show"} trades ({h.trades.length})
          </Button>
        )}
      </div>
      {showTrades && (
        <ul className="mt-2 divide-y rounded-lg border text-sm">
          {h.trades.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{day(t.date)}</span>
              <span className={cn("w-10 text-xs font-medium", t.side === "BUY" ? "text-foreground" : "text-positive")}>{t.side === "BUY" ? "Buy" : "Sell"}</span>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">{t.units} units</span>
              <span className="tabular">{fmt(t.amount)}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${t.side === "BUY" ? "buy" : "sale"} of ${day(t.date)}`}
                onClick={() => open({ kind: "delete-trade", tradeId: t.id, label: `${t.side === "BUY" ? "buy" : "sale"} of ${day(t.date)}` })}
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

export function InvestmentsView({ data, pref, today }: { data: InvestmentsDTO; pref: NumberFormatPref; today: string }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, start] = useTransition();
  const fmtIn = (c: string) => (v: string) => formatMoney(v, c, { pref, compactDecimals: true });
  const fmt = fmtIn(data.baseCurrency);
  const close = (o: boolean) => !o && setDialog(null);
  const t = data.totals;

  return (
    <>
      <PageHeader
        title="Investments"
        description="Holdings in your investment accounts, valued at the prices you record. Gains and losses change net worth, never income or spending."
        actions={
          <Button asChild variant="outline">
            <Link href="/accounts">
              <Plus /> Add investment account
            </Link>
          </Button>
        }
      />

      {data.accounts.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No investment accounts"
          description="Add an account of type Investment account (e.g. your BO account), transfer money into it, then add holdings here."
          action={
            <Button asChild>
              <Link href="/accounts">Go to accounts</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Market value" icon={TrendingUp} value={fmt(t.marketValue)} hint={t.unpricedCount ? `${t.unpricedCount} holding(s) without a price, at cost` : "Holdings at latest price"} />
            <KpiCard label="Invested" icon={Coins} value={fmt(t.invested)} hint="Cost of what you still hold" />
            <KpiCard
              label="Unrealised gain"
              icon={LineChart}
              value={<Gain value={t.unrealized} pct={t.unrealizedPct} fmt={fmt} />}
              hint={<>Realised so far: <Gain value={t.realized} fmt={fmt} /></>}
            />
            <KpiCard label="Cash to invest" icon={Wallet} value={fmt(t.cash)} hint={t.otherCurrencyCount ? `${t.otherCurrencyCount} account(s) in another currency not totalled` : "Uninvested money in these accounts"} />
          </div>

          {data.allocation.length > 0 && (
            <SectionCard title="Allocation" description="Share of market value by type.">
              <ul className="space-y-3 p-5">
                {data.allocation.map((a, i) => (
                  <li key={a.assetClass}>
                    <div className="flex justify-between text-sm">
                      <span>{ASSET_CLASS_LABELS[a.assetClass as keyof typeof ASSET_CLASS_LABELS]}</span>
                      <span className="tabular text-muted-foreground">
                        {fmt(a.value)} · {a.pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${a.pct}%`}>
                      <div className="h-full rounded-full" style={{ width: `${a.pct}%`, backgroundColor: `var(--chart-${(i % 8) + 1})` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {data.accounts.map((a) => {
            const f = fmtIn(a.currency);
            return (
              <SectionCard
                key={a.accountId}
                title={a.name}
                description={
                  <>
                    Worth {f(a.value)} · cash {f(a.cash)} · moved in {f(a.contributed)}
                  </>
                }
                actions={
                  <Button size="sm" onClick={() => setDialog({ kind: "holding", account: a })}>
                    <Plus /> Holding
                  </Button>
                }
              >
                {a.holdings.length === 0 ? (
                  <div className="flex items-center gap-3 px-5 py-6 text-sm text-muted-foreground">
                    <FinanceIcon name={a.icon} color={a.color} />
                    No holdings yet. Add one, then record a buy.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {a.holdings.map((h) => (
                      <HoldingRow key={h.id} h={h} account={a} fmt={f} open={setDialog} />
                    ))}
                  </ul>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      {dialog?.kind === "holding" && <HoldingDialog onOpenChange={close} account={dialog.account} editing={dialog.editing} />}
      {dialog?.kind === "trade" && <TradeDialog onOpenChange={close} account={dialog.account} holding={dialog.holding} side={dialog.side} today={today} />}
      {dialog?.kind === "price" && <PriceDialog onOpenChange={close} holding={dialog.holding} currency={dialog.account.currency} today={today} />}
      <AlertDialog open={dialog?.kind === "delete-holding" || dialog?.kind === "delete-trade"} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.kind === "delete-holding" ? `Delete ${dialog.holding.name}?` : `Delete the ${dialog?.kind === "delete-trade" ? dialog.label : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.kind === "delete-holding"
                ? "Its trades and prices are removed. What it cost goes back to the account's cash; your transfers are untouched."
                : "The holding's units, cost and gains are recalculated. Later sales must still be covered."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                start(async () => {
                  const r =
                    dialog?.kind === "delete-holding"
                      ? await deleteHoldingAction({ id: dialog.holding.id })
                      : dialog?.kind === "delete-trade"
                        ? await deleteTradeAction({ id: dialog.tradeId })
                        : null;
                  if (r && !r.ok) toast.error(r.error);
                  else if (r) toast.success("Deleted");
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
