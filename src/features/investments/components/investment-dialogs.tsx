"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import type { HoldingDTO, InvestmentAccountDTO } from "@/server/queries/investments.query";
import { createHoldingAction, recordPriceAction, recordTradeAction, updateHoldingAction } from "../actions";
import { ASSET_CLASSES } from "../schemas";

export const ASSET_CLASS_LABELS: Record<(typeof ASSET_CLASSES)[number], string> = {
  STOCK: "Stocks",
  MUTUAL_FUND: "Mutual funds",
  BOND: "Bonds",
  SAVINGS_CERTIFICATE: "Savings certificates",
  FIXED_DEPOSIT: "Fixed deposits",
  GOLD: "Gold",
  CRYPTO: "Crypto",
  OTHER: "Other",
};

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function useSubmit(onDone: () => void, success: string) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.error);
        return;
      }
      toast.success(success);
      onDone();
    });
  return { error, pending, run };
}

function Footer({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
    </DialogFooter>
  );
}

export function HoldingDialog({
  onOpenChange,
  account,
  editing,
}: {
  onOpenChange: (o: boolean) => void;
  account: InvestmentAccountDTO;
  editing?: HoldingDTO;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [symbol, setSymbol] = useState(editing?.symbol ?? "");
  const [assetClass, setAssetClass] = useState<(typeof ASSET_CLASSES)[number]>((editing?.assetClass as (typeof ASSET_CLASSES)[number]) ?? "STOCK");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const { error, pending, run } = useSubmit(() => onOpenChange(false), editing ? "Holding updated" : "Holding added");
  const values = { accountId: account.accountId, name, symbol, assetClass, notes };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit holding" : `Add holding · ${account.name}`}</DialogTitle>
          <DialogDescription>A share, fund, bond, certificate or anything else you hold in this account. Record a buy next.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (editing ? updateHoldingAction({ id: editing.id, values }) : createHoldingAction(values)));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="h-name">Name</Label>
              <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grameenphone" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="h-symbol">Symbol (optional)</Label>
              <Input id="h-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="GP" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={assetClass} onValueChange={(v) => setAssetClass(v as typeof assetClass)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CLASSES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ASSET_CLASS_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="h-notes">Notes (optional)</Label>
            <Input id="h-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <Footer pending={pending} label={editing ? "Save" : "Add holding"} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TradeDialog({
  onOpenChange,
  account,
  holding,
  side,
  today,
}: {
  onOpenChange: (o: boolean) => void;
  account: InvestmentAccountDTO;
  holding: HoldingDTO;
  side: "BUY" | "SELL";
  today: string;
}) {
  const [units, setUnits] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const buying = side === "BUY";
  const { error, pending, run } = useSubmit(() => onOpenChange(false), buying ? "Buy recorded" : "Sale recorded");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {buying ? "Buy" : "Sell"} · {holding.name}
          </DialogTitle>
          <DialogDescription>
            {buying
              ? `Paid from the account's cash (${formatMoney(account.cash, account.currency)} available). Move money in with a transfer first if needed.`
              : `You hold ${holding.units} units. Proceeds stay in the account as cash; the gain or loss is not income or spending.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            run(() => recordTradeAction({ holdingId: holding.id, side, date, units, amount, notes }));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="t-units">Units</Label>
              <Input id="t-units" inputMode="decimal" className="tabular" value={units} onChange={(e) => setUnits(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-amount">{buying ? "Total paid (incl. fees)" : "Proceeds (after fees)"}</Label>
              <Input id="t-amount" inputMode="decimal" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="t-date">Date</Label>
              <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-notes">Notes (optional)</Label>
              <Input id="t-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <Footer pending={pending} label={buying ? "Record buy" : "Record sale"} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PriceDialog({ onOpenChange, holding, currency, today }: { onOpenChange: (o: boolean) => void; holding: HoldingDTO; currency: string; today: string }) {
  const [priceValue, setPrice] = useState(holding.price ?? "");
  const [date, setDate] = useState(today);
  const { error, pending, run } = useSubmit(() => onOpenChange(false), "Price recorded");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update price · {holding.name}</DialogTitle>
          <DialogDescription>
            Price per unit in {currency}.{" "}
            {holding.priceDate ? `Last recorded ${holding.price} on ${holding.priceDate}.` : "No price recorded yet, so it's valued at cost."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            run(() => recordPriceAction({ holdingId: holding.id, date, price: priceValue }));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pr-price">Price</Label>
              <Input id="pr-price" inputMode="decimal" className="tabular" value={priceValue} onChange={(e) => setPrice(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-date">As of</Label>
              <Input id="pr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <Footer pending={pending} label="Save price" onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
