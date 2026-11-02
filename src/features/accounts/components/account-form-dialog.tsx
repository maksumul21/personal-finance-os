"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ColorPicker, IconPicker } from "@/components/finance/appearance-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { accountNature, type AccountType } from "@/domain/accounts";
import { CURRENCIES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createAccountAction, updateAccountAction } from "../actions";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_PRESETS, PROVIDER_LABELS } from "../labels";
import { accountFormSchema, type AccountFormInput, type AccountFormValues, MFS_PROVIDERS } from "../schemas";

const ACCOUNT_ICONS = ["wallet", "banknote", "landmark", "building-2", "piggy-bank", "smartphone", "credit-card", "hand-coins", "trending-up", "gem"];

export interface AccountFormDefaults {
  id?: string;
  values: AccountFormInput;
  hasTransactions?: boolean;
}

export function emptyAccountForm(today: string, currency: string): AccountFormInput {
  return {
    name: "",
    type: "BANK",
    provider: null,
    currency: currency as AccountFormInput["currency"],
    openingBalance: "0",
    openingDate: today,
    creditLimit: "",
    color: "#2563eb",
    icon: "landmark",
    description: "",
    includeInSafeToSpend: true,
  };
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-negative">{message}</p> : null;
}

export function AccountFormDialog({
  open,
  onOpenChange,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: AccountFormDefaults;
}) {
  const editing = Boolean(defaults.id);
  const [pending, startTransition] = useTransition();
  const form = useForm<AccountFormInput, unknown, AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: defaults.values,
  });
  const { register, control, handleSubmit, setValue, reset, setError, formState } = form;

  useEffect(() => {
    if (open) reset(defaults.values);
  }, [open, defaults, reset]);

  const type = useWatch({ control, name: "type" }) as AccountType;
  const color = useWatch({ control, name: "color" });
  const liability = accountNature(type) === "LIABILITY";

  const applyPreset = (key: string) => {
    const p = ACCOUNT_PRESETS.find((x) => x.key === key)!;
    setValue("type", p.type);
    setValue("provider", p.provider ?? null);
    setValue("icon", p.icon);
    setValue("color", p.color);
    if (!form.getValues("name")) setValue("name", p.name);
  };

  // Validate on the client, but send the raw input: the server parses it again authoritatively.
  const onSubmit = handleSubmit(() => {
    const values = form.getValues();
    startTransition(async () => {
      const result = editing
        ? await updateAccountAction({ id: defaults.id!, values })
        : await createAccountAction(values);
      if (!result.ok) {
        for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
          const key = field.replace(/^values\./, "") as keyof AccountFormInput;
          setError(key, { message: messages[0] });
        }
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Account updated" : "Account created");
      onOpenChange(false);
    });
  });

  const errors = formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>
            {editing ? "Balances are always recalculated from the opening balance and transactions." : "Start from a preset or set it up yourself."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {!editing && (
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_PRESETS.map((p) => (
                <Button key={p.key} type="button" variant="outline" size="sm" onClick={() => applyPreset(p.key)}>
                  {p.name}
                </Button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="acc-name">Account name</Label>
            <Input id="acc-name" placeholder="e.g. City Bank Salary" aria-invalid={!!errors.name} {...register("name")} />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-invalid={!!errors.type}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.type?.message} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={editing && defaults.hasTransactions}>
                    <SelectTrigger className="w-full" aria-invalid={!!errors.currency}>
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
                )}
              />
              {editing && defaults.hasTransactions && (
                <p className="text-xs text-muted-foreground">Locked because the account has transactions.</p>
              )}
              <FieldError message={errors.currency?.message} />
            </div>
          </div>

          {type === "MFS" && (
            <div className="space-y-2">
              <Label>Provider</Label>
              <Controller
                control={control}
                name="provider"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || null)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {MFS_PROVIDERS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PROVIDER_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="acc-opening">{liability ? "Amount owed at start" : "Opening balance"}</Label>
              <Input
                id="acc-opening"
                inputMode="decimal"
                className="tabular"
                aria-invalid={!!errors.openingBalance}
                {...register("openingBalance")}
              />
              <FieldError message={errors.openingBalance?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-date">As of</Label>
              <Input id="acc-date" type="date" aria-invalid={!!errors.openingDate} {...register("openingDate")} />
              <FieldError message={errors.openingDate?.message} />
            </div>
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">
            The opening balance is not counted as income{liability ? " or expense" : ""}.
          </p>

          {type === "CREDIT_CARD" && (
            <div className="space-y-2">
              <Label htmlFor="acc-limit">Credit limit (optional)</Label>
              <Input id="acc-limit" inputMode="decimal" className="tabular" {...register("creditLimit")} />
              <FieldError message={errors.creditLimit?.message} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Colour</Label>
            <Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <Controller
              control={control}
              name="icon"
              render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} color={color} icons={ACCOUNT_ICONS} />}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-desc">Description (optional)</Label>
            <Textarea id="acc-desc" rows={2} {...register("description")} />
          </div>

          {!liability && (
            <Controller
              control={control}
              name="includeInSafeToSpend"
              render={({ field }) => (
                <label className={cn("flex items-start justify-between gap-4 rounded-lg border p-3")}>
                  <span>
                    <span className="block text-sm font-medium">Count as spendable money</span>
                    <span className="block text-xs text-muted-foreground">Included in Safe-to-Spend. Turn off for savings you don’t touch.</span>
                  </span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
