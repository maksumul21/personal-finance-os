"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RepeatUnit } from "@/domain/recurrence";

/** PRD §5.7 frequencies, mapped onto unit × interval. Quarterly = every 3 months. */
const PRESETS = {
  DAILY: { unit: "DAILY", interval: 1, label: "Daily" },
  WEEKLY: { unit: "WEEKLY", interval: 1, label: "Weekly" },
  MONTHLY: { unit: "MONTHLY", interval: 1, label: "Monthly" },
  QUARTERLY: { unit: "MONTHLY", interval: 3, label: "Quarterly" },
  YEARLY: { unit: "YEARLY", interval: 1, label: "Yearly" },
} as const;
type Preset = keyof typeof PRESETS | "CUSTOM";

function presetOf(unit: RepeatUnit, interval: number): Preset {
  const hit = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find((k) => PRESETS[k].unit === unit && PRESETS[k].interval === interval);
  return hit ?? "CUSTOM";
}

const UNIT_LABELS: Record<RepeatUnit, string> = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years" };

/** Frequency picker shared by recurring transactions and bills. */
export function ScheduleFields({
  unit,
  interval,
  onChange,
  allowOnce = false,
  once = false,
  onOnceChange,
}: {
  unit: RepeatUnit;
  interval: number;
  onChange: (unit: RepeatUnit, interval: number) => void;
  allowOnce?: boolean;
  once?: boolean;
  onOnceChange?: (once: boolean) => void;
}) {
  const preset: Preset | "ONCE" = once ? "ONCE" : presetOf(unit, interval);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Repeats</Label>
        <Select
          value={preset}
          onValueChange={(v) => {
            if (v === "ONCE") return onOnceChange?.(true);
            onOnceChange?.(false);
            if (v === "CUSTOM") onChange(unit, interval === 1 ? 2 : interval);
            else onChange(PRESETS[v as keyof typeof PRESETS].unit, PRESETS[v as keyof typeof PRESETS].interval);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowOnce && <SelectItem value="ONCE">Once (not repeating)</SelectItem>}
            {Object.entries(PRESETS).map(([k, p]) => (
              <SelectItem key={k} value={k}>
                {p.label}
              </SelectItem>
            ))}
            <SelectItem value="CUSTOM">Custom…</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {preset === "CUSTOM" && (
        <div className="space-y-2">
          <Label htmlFor="sched-n">Every</Label>
          <div className="flex gap-2">
            <Input
              id="sched-n"
              type="number"
              inputMode="numeric"
              min={1}
              max={366}
              value={interval}
              onChange={(e) => onChange(unit, Math.max(1, Math.min(366, Number(e.target.value) || 1)))}
              className="w-20"
            />
            <Select value={unit} onValueChange={(v) => onChange(v as RepeatUnit, interval)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(UNIT_LABELS) as RepeatUnit[]).map((u) => (
                  <SelectItem key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
