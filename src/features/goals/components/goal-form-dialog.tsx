"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ColorPicker, IconPicker } from "@/components/finance/appearance-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { emergencyTarget } from "@/domain/goals";
import { parseAmount } from "@/domain/money";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComposerAccount } from "@/server/queries/composer.query";
import { createGoalAction, updateGoalAction } from "../actions";
import { goalFormSchema, type GoalFormInput, type GoalFormValues } from "../schemas";

const GOAL_ICONS = ["piggy-bank", "shield-check", "laptop", "plane", "house", "car", "gift", "graduation-cap", "heart-pulse", "sparkles", "smartphone", "gem"];

export const GOAL_TYPE_INFO: Record<GoalFormInput["goalType"], { label: string; text: string }> = {
  GOAL: { label: "Savings goal", text: "Save toward something by a date." },
  SINKING_FUND: { label: "Sinking fund", text: "Set aside for a known future expense, like Eid shopping or insurance." },
  EMERGENCY_FUND: { label: "Emergency fund", text: "Months of essential expenses kept aside for surprises." },
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-negative">{message}</p> : null;
}

export function GoalFormDialog({
  open,
  onOpenChange,
  editId,
  defaults,
  accounts,
  baseCurrency,
  suggestion,
  lockAccount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editId?: string;
  defaults: GoalFormInput;
  accounts: ComposerAccount[];
  baseCurrency: string;
  suggestion: { amount: string; months: number } | null;
  /** The goal already has transfers into its account. */
  lockAccount?: boolean;
}) {
  const [pending, start] = useTransition();
  const form = useForm<GoalFormInput, unknown, GoalFormValues>({ resolver: zodResolver(goalFormSchema), defaultValues: defaults });
  const { control, register, formState, setError, reset, setValue } = form;
  const e = formState.errors;
  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const type = useWatch({ control, name: "goalType" });
  const color = useWatch({ control, name: "color" });
  const essential = useWatch({ control, name: "essentialMonthly" });
  const months = useWatch({ control, name: "targetMonths" });
  const savingAccounts = accounts.filter((a) => !a.isArchived && !a.isLiability && a.type !== "INVESTMENT");
  // Same domain function the server uses to store the target.
  const essentialAmount = parseAmount(String(essential ?? ""));
  const efTarget = essentialAmount?.greaterThan(0) && months ? emergencyTarget(essentialAmount, months).toFixed(2) : null;

  const submit = form.handleSubmit(() =>
    start(async () => {
      const values = form.getValues();
      const r = editId ? await updateGoalAction({ id: editId, values }) : await createGoalAction(values);
      if (!r.ok) {
        for (const [k, m] of Object.entries(r.fieldErrors ?? {})) setError(k.replace(/^values\./, "") as keyof GoalFormInput, { message: m[0] });
        toast.error(r.error);
        return;
      }
      toast.success(editId ? "Goal updated" : "Goal created");
      onOpenChange(false);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>Saving toward a goal is never counted as an expense.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          {!editId && (
            <Controller
              control={control}
              name="goalType"
              render={({ field }) => (
                <div role="radiogroup" aria-label="Goal type" className="grid gap-2 sm:grid-cols-3">
                  {Object.entries(GOAL_TYPE_INFO).map(([v, info]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={field.value === v}
                      onClick={() => {
                        field.onChange(v);
                        if (v === "EMERGENCY_FUND") {
                          setValue("icon", "shield-check");
                          if (!form.getValues("name")) setValue("name", "Emergency fund");
                        }
                      }}
                      className={cn(
                        "rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        field.value === v ? "border-primary bg-accent" : "hover:bg-muted",
                      )}
                    >
                      <span className="block text-sm font-medium">{info.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{info.text}</span>
                    </button>
                  ))}
                </div>
              )}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="g-name">Name</Label>
            <Input id="g-name" placeholder={type === "SINKING_FUND" ? "e.g. Eid shopping" : "e.g. New laptop"} {...register("name")} aria-invalid={!!e.name} />
            <FieldError message={e.name?.message} />
          </div>

          {type === "EMERGENCY_FUND" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="g-ess">Essential monthly expenses</Label>
                <Input id="g-ess" inputMode="decimal" className="tabular" {...register("essentialMonthly")} aria-invalid={!!e.essentialMonthly} />
                {suggestion ? (
                  <button
                    type="button"
                    className="text-left text-xs text-primary hover:underline"
                    onClick={() => setValue("essentialMonthly", suggestion.amount, { shouldValidate: true })}
                  >
                    Use {formatMoney(suggestion.amount, baseCurrency, { compactDecimals: true })}: your average essential spending over the last {suggestion.months} months
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">Rent, utilities, groceries, transport, healthcare…</p>
                )}
                <FieldError message={e.essentialMonthly?.message} />
              </div>
              <div className="space-y-2">
                <Label>Months to cover</Label>
                <Controller
                  control={control}
                  name="targetMonths"
                  render={({ field }) => (
                    <Select value={String(field.value ?? 6)} onValueChange={(v) => field.onChange(Number(v))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {m} month{m > 1 ? "s" : ""}
                            {m === 3 || m === 6 ? " (suggested range 3–6)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="tabular text-xs text-muted-foreground">
                  Target: {efTarget ? formatMoney(efTarget, baseCurrency, { compactDecimals: true }) : "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="g-target">Target amount</Label>
                <Input id="g-target" inputMode="decimal" className="tabular" {...register("targetAmount")} aria-invalid={!!e.targetAmount} />
                <FieldError message={e.targetAmount?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-date">Target date</Label>
                <Input id="g-date" type="date" {...register("targetDate")} aria-invalid={!!e.targetDate} />
                <FieldError message={e.targetDate?.message} />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Money kept in</Label>
              <Controller
                control={control}
                name="linkedAccountId"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} disabled={lockAccount}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific account</SelectItem>
                      {savingAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                {lockAccount ? "Locked: money has already been transferred into it." : "Lets contributions move money into this account."}
              </p>
              <FieldError message={e.linkedAccountId?.message} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Colour</Label>
            <Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} />} />
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <Controller control={control} name="icon" render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} color={color} icons={GOAL_ICONS} />} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-desc">Description (optional)</Label>
            <Textarea id="g-desc" rows={2} {...register("description")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editId ? "Save" : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
