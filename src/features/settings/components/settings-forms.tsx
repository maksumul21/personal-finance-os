"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SectionCard } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES, formatMoney } from "@/lib/format";
import { useIsClient } from "@/lib/use-is-client";
import type { PreferencesDTO } from "@/server/queries/settings.query";
import { updatePreferencesAction, updateProfileAction, updateThemeAction } from "../actions";
import { DASHBOARD_PERIODS, DATE_FORMATS, preferencesSchema, profileSchema, type PreferencesInput } from "../schemas";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIOD_LABELS: Record<(typeof DASHBOARD_PERIODS)[number], string> = {
  THIS_MONTH: "This month",
  LAST_MONTH: "Last month",
  LAST_3_MONTHS: "Last 3 months",
  LAST_6_MONTHS: "Last 6 months",
  THIS_YEAR: "This year",
};

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-negative">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ProfileForm({ prefs }: { prefs: PreferencesDTO }) {
  const [pending, start] = useTransition();
  const form = useForm<z.input<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { name: prefs.name } });
  const submit = form.handleSubmit((values) =>
    start(async () => {
      const r = await updateProfileAction(values);
      if (r.ok) toast.success("Profile saved");
      else toast.error(r.error);
    }),
  );
  return (
    <SectionCard title="Profile">
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" error={form.formState.errors.name?.message}>
          <Input id="name" autoComplete="name" defaultValue={prefs.name} {...form.register("name")} />
        </Field>
        <Field label="Email" htmlFor="email" hint="Managed by your sign-in provider.">
          <Input id="email" value={prefs.email} disabled readOnly />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function PreferencesForm({ prefs, timezones }: { prefs: PreferencesDTO; timezones: string[] }) {
  const [pending, start] = useTransition();
  const form = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      baseCurrency: prefs.baseCurrency as PreferencesInput["baseCurrency"],
      timezone: prefs.timezone,
      dateFormat: prefs.dateFormat as PreferencesInput["dateFormat"],
      numberFormat: prefs.numberFormat,
      weekStartsOn: prefs.weekStartsOn,
      dashboardPeriod: prefs.dashboardPeriod,
      budgetWarnPct: prefs.budgetWarnPct,
      budgetCriticalPct: prefs.budgetCriticalPct,
    },
  });
  const { control, register, formState } = form;
  const e = formState.errors;
  const submit = form.handleSubmit((values) =>
    start(async () => {
      const r = await updatePreferencesAction(values);
      if (r.ok) {
        toast.success("Preferences saved");
        return;
      }
      for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof PreferencesInput, { message: m[0] });
      toast.error(r.error);
    }),
  );

  const selectField = <K extends keyof PreferencesInput>(name: K, options: { value: string; label: string }[], disabled = false) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          value={String(field.value)}
          onValueChange={(v) => field.onChange(typeof field.value === "number" ? Number(v) : v)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  return (
    <SectionCard title="Preferences" description="How amounts, dates and periods are shown.">
      <form onSubmit={submit} className="grid gap-5 p-5 sm:grid-cols-2">
        <Field
          label="Base currency"
          error={e.baseCurrency?.message}
          hint={prefs.hasTransactions ? "Locked: transactions already use this base currency." : "Used for consolidated totals and reports."}
        >
          {selectField("baseCurrency", CURRENCIES.map((c) => ({ value: c, label: c })), prefs.hasTransactions)}
        </Field>
        <Field label="Timezone" error={e.timezone?.message} hint="Defines “today” and month boundaries.">
          {selectField("timezone", timezones.map((t) => ({ value: t, label: t.replaceAll("_", " ") })))}
        </Field>
        <Field label="Number format" error={e.numberFormat?.message}>
          {selectField("numberFormat", [
            { value: "LAKH", label: `Lakh / crore (${formatMoney("1250000", "BDT", { pref: "LAKH" })})` },
            { value: "INTL", label: `International (${formatMoney("1250000", "BDT", { pref: "INTL" })})` },
          ])}
        </Field>
        <Field label="Date format" error={e.dateFormat?.message}>
          {selectField("dateFormat", DATE_FORMATS.map((f) => ({ value: f, label: f })))}
        </Field>
        <Field label="First day of week" error={e.weekStartsOn?.message}>
          {selectField("weekStartsOn", WEEKDAYS.map((d, i) => ({ value: String(i), label: d })))}
        </Field>
        <Field label="Default dashboard period" error={e.dashboardPeriod?.message}>
          {selectField("dashboardPeriod", DASHBOARD_PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] })))}
        </Field>
        <Field label="Budget warning at (%)" htmlFor="warn" error={e.budgetWarnPct?.message} hint="Category turns amber.">
          <Input id="warn" type="number" inputMode="numeric" min={1} max={99} defaultValue={prefs.budgetWarnPct} {...register("budgetWarnPct", { valueAsNumber: true })} />
        </Field>
        <Field label="Budget critical at (%)" htmlFor="crit" error={e.budgetCriticalPct?.message} hint="Category turns red-orange. 100% is always overspent.">
          <Input id="crit" type="number" inputMode="numeric" min={2} max={100} defaultValue={prefs.budgetCriticalPct} {...register("budgetCriticalPct", { valueAsNumber: true })} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function AppearanceForm() {
  const { theme: resolvedTheme, setTheme } = useTheme();
  // The theme lives in the browser, so the server can't render the selected button.
  const theme = useIsClient() ? resolvedTheme : undefined;
  const options = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <SectionCard title="Appearance">
      <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2 p-5">
        {options.map((o) => (
          <Button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={theme === o.value}
            variant={theme === o.value ? "default" : "outline"}
            onClick={() => {
              setTheme(o.value);
              void updateThemeAction({ theme: o.value.toUpperCase() as "LIGHT" | "DARK" | "SYSTEM" });
            }}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}

export function SettingsForms({ prefs, timezones }: { prefs: PreferencesDTO; timezones: string[] }) {
  return (
    <div className="space-y-6">
      <ProfileForm prefs={prefs} />
      <PreferencesForm prefs={prefs} timezones={timezones} />
      <AppearanceForm />
    </div>
  );
}
