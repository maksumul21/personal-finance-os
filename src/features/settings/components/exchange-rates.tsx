"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteExchangeRateAction, recordExchangeRateAction } from "@/features/transactions/actions";
import { CURRENCIES } from "@/lib/format";
import type { RateDTO } from "@/server/queries/transactions.query";

/** PRD §18.4: rates are recorded by the user, never fetched or guessed. */
export function ExchangeRates({ rates, baseCurrency, today }: { rates: RateDTO[]; baseCurrency: string; today: string }) {
  const others = CURRENCIES.filter((c) => c !== baseCurrency);
  const [currency, setCurrency] = useState<string>(others[0]);
  const [date, setDate] = useState(today);
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await recordExchangeRateAction({ currency, date, rate });
      if (!r.ok) {
        setError(r.fieldErrors?.rate?.[0] ?? r.error);
        return;
      }
      setError(undefined);
      setRate("");
      toast.success(`Rate saved: 1 ${currency} = ${rate} ${baseCurrency}`);
    });
  };
  const remove = (id: string) =>
    start(async () => {
      const r = await deleteExchangeRateAction({ id });
      if (!r.ok) toast.error(r.error);
    });

  return (
    <SectionCard
      title="Exchange rates"
      description={`Used to convert other currencies into ${baseCurrency} for totals and reports. The latest rate on or before a date applies.`}
    >
      <form onSubmit={add} className="grid gap-3 border-b p-5 sm:grid-cols-[120px_160px_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {others.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rate-date">From date</Label>
          <Input id="rate-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rate-value">
            1 {currency} = ? {baseCurrency}
          </Label>
          <Input id="rate-value" inputMode="decimal" className="tabular" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 121.50" />
        </div>
        <Button type="submit" disabled={pending || !rate}>
          Save rate
        </Button>
        {error && <p className="text-xs text-negative sm:col-span-4">{error}</p>}
      </form>
      {rates.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">No rates recorded. Accounts in other currencies stay out of totals until you add one.</p>
      ) : (
        <ul className="divide-y">
          {rates.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="w-12 font-medium">{r.currency}</span>
              <span className="tabular flex-1">
                1 {r.currency} = {r.rate} {baseCurrency}
              </span>
              <span className="tabular text-muted-foreground">{r.date}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.currency} rate for ${r.date}`} onClick={() => remove(r.id)} disabled={pending}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
