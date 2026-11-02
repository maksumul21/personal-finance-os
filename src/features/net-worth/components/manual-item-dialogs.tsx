"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/format";
import type { ManualItemDTO } from "@/server/queries/net-worth.query";
import { createManualItemAction, recordValuationAction, updateManualItemAction } from "../actions";
import { ASSET_CATEGORIES, LIABILITY_CATEGORIES, type ITEM_CATEGORIES } from "../schemas";

type Category = (typeof ITEM_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  PROPERTY: "Property",
  VEHICLE: "Vehicle",
  VALUABLES: "Gold & valuables",
  RECEIVABLE: "Money lent",
  BUSINESS: "Business",
  RETIREMENT: "Retirement / provident fund",
  PERSONAL_DEBT: "Borrowed (personal)",
  TAX: "Tax due",
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

export function ManualItemDialog({
  onOpenChange,
  editing,
  itemKind,
  baseCurrency,
  today,
}: {
  onOpenChange: (o: boolean) => void;
  editing?: ManualItemDTO;
  itemKind: "ASSET" | "LIABILITY";
  baseCurrency: string;
  today: string;
}) {
  const categories = itemKind === "ASSET" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState<Category>((editing?.category as Category) ?? categories[0]);
  const [currency, setCurrency] = useState(editing?.currency ?? baseCurrency);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const asset = itemKind === "ASSET";
  const { error, pending, run } = useSubmit(() => onOpenChange(false), editing ? "Saved" : "Added");
  const item = { name, kind: itemKind, category, currency: currency as (typeof CURRENCIES)[number], notes };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : asset ? "Add an asset" : "Add a liability"}</DialogTitle>
          <DialogDescription>
            {asset ? "Its value counts in net worth from the date you give." : "The amount owed counts against net worth from the date you give."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (editing ? updateManualItemAction({ id: editing.id, values: item }) : createManualItemAction({ item, value, date })));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="m-name">Name</Label>
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={asset ? "e.g. Mirpur flat" : "e.g. Loan from uncle"} autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={!!editing}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="m-value">{asset ? "Current value" : "Amount owed"}</Label>
                <Input id="m-value" inputMode="decimal" className="tabular" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-date">As of</Label>
                <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="m-notes">Notes (optional)</Label>
            <Input id="m-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ValuationDialog({ onOpenChange, item, today }: { onOpenChange: (o: boolean) => void; item: ManualItemDTO; today: string }) {
  const [value, setValue] = useState(item.value ?? "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const { error, pending, run } = useSubmit(() => onOpenChange(false), "Value recorded");
  const asset = item.kind === "ASSET";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update {item.name}</DialogTitle>
          <DialogDescription>
            {asset ? "Value" : "Amount owed"} in {item.currency} from this date on. Enter 0 if it was sold or settled.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            run(() => recordValuationAction({ itemId: item.id, date, value, note }));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="v-value">{asset ? "Value" : "Owed"}</Label>
              <Input id="v-value" inputMode="decimal" className="tabular" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-date">As of</Label>
              <Input id="v-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-note">Note (optional)</Label>
            <Input id="v-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Valuation report" />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save value"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
