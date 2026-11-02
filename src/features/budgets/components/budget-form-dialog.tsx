"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createBudgetAction } from "../actions";
import { budgetFormSchema, type BudgetFormInput, type BudgetFormValues } from "../schemas";

export const METHOD_INFO: Record<BudgetFormInput["method"], { label: string; text: string }> = {
  STANDARD: { label: "Standard", text: "Set limits for the categories you want to watch." },
  ZERO_BASED: { label: "Zero-based", text: "Give every taka of income a job until nothing is unallocated." },
  FIFTY_THIRTY_TWENTY: { label: "50/30/20", text: "50% needs, 30% wants, 20% savings. Adds a savings line." },
  SEVENTY_TWENTY_TEN: { label: "70/20/10", text: "70% living costs, 20% savings, 10% debt repayment or giving." },
};

export const PERIOD_LABELS: Record<BudgetFormInput["periodType"], string> = {
  MONTHLY: "Monthly",
  WEEKLY: "Weekly",
  ANNUAL: "Annual",
  CUSTOM: "Custom dates",
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-negative">{message}</p> : null;
}

export function BudgetFormDialog({
  open,
  onOpenChange,
  today,
  copyOptions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  today: string;
  copyOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<BudgetFormInput, unknown, BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      name: `${format(parseISO(today), "MMMM yyyy")} budget`,
      periodType: "MONTHLY",
      start: today,
      end: "",
      method: "STANDARD",
      incomeSource: "PLANNED",
      plannedIncome: "",
      copyFromId: copyOptions[0]?.id ?? "",
    },
  });
  const { control, register, formState, setError } = form;
  const e = formState.errors;
  const periodType = useWatch({ control, name: "periodType" });
  const incomeSource = useWatch({ control, name: "incomeSource" });

  const submit = form.handleSubmit(() =>
    start(async () => {
      const r = await createBudgetAction(form.getValues());
      if (!r.ok) {
        for (const [k, m] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof BudgetFormInput, { message: m[0] });
        toast.error(r.error);
        return;
      }
      toast.success("Budget created");
      onOpenChange(false);
      router.push(`/budgets/${r.data.id}`);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New budget</DialogTitle>
          <DialogDescription>A plan only: limits and savings lines never move money between accounts.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="b-name">Name</Label>
            <Input id="b-name" {...register("name")} aria-invalid={!!e.name} />
            <FieldError message={e.name?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Period</Label>
              <Controller
                control={control}
                name="periodType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PERIOD_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-start">{periodType === "CUSTOM" ? "Starts" : "Any day in the period"}</Label>
              <Input id="b-start" type="date" {...register("start")} aria-invalid={!!e.start} />
              <FieldError message={e.start?.message} />
            </div>
          </div>
          {periodType === "CUSTOM" && (
            <div className="space-y-2">
              <Label htmlFor="b-end">Ends</Label>
              <Input id="b-end" type="date" {...register("end")} aria-invalid={!!e.end} />
              <FieldError message={e.end?.message} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Method</Label>
            <Controller
              control={control}
              name="method"
              render={({ field }) => (
                <div role="radiogroup" aria-label="Budget method" className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(METHOD_INFO).map(([v, info]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={field.value === v}
                      onClick={() => field.onChange(v)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Income to allocate</Label>
              <Controller
                control={control}
                name="incomeSource"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLANNED">An amount I enter</SelectItem>
                      <SelectItem value="ACTUAL">Income actually received</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {incomeSource === "PLANNED" && (
              <div className="space-y-2">
                <Label htmlFor="b-income">Planned income</Label>
                <Input id="b-income" inputMode="decimal" className="tabular" placeholder="e.g. 50,000" {...register("plannedIncome")} />
                <FieldError message={e.plannedIncome?.message} />
              </div>
            )}
          </div>

          {copyOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Start from</Label>
              <Controller
                control={control}
                name="copyFromId"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">An empty budget</SelectItem>
                      {copyOptions.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          Copy limits from “{b.name}”
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
