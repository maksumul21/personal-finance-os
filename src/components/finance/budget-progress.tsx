import { AlertTriangle, CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import type { UsageState } from "@/domain/budget";
import { cn } from "@/lib/utils";

/** PRD §6.2 states. Status colour always comes with an icon and a word. */
export const STATE_META: Record<UsageState, { label: string; bar: string; text: string; icon: typeof CircleCheck }> = {
  normal: { label: "On track", bar: "bg-primary", text: "text-muted-foreground", icon: CircleCheck },
  warning: { label: "Warning", bar: "bg-warning", text: "text-warning", icon: TriangleAlert },
  critical: { label: "Critical", bar: "bg-serious", text: "text-serious", icon: AlertTriangle },
  overspent: { label: "Overspent", bar: "bg-negative", text: "text-negative", icon: OctagonAlert },
};

export function BudgetProgress({
  usagePct,
  state,
  className,
  label,
}: {
  usagePct: string | null;
  state: UsageState;
  className?: string;
  /** Accessible name, e.g. "Food budget". */
  label: string;
}) {
  const pct = usagePct === null ? (state === "overspent" ? 100 : 0) : Math.min(100, Math.max(0, Number(usagePct)));
  const meta = STATE_META[state];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={`${usagePct ?? "0"}% used, ${meta.label}`}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", meta.bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function UsageBadge({ state, usagePct }: { state: UsageState; usagePct: string | null }) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", meta.text)}>
      <Icon className="size-3.5" aria-hidden />
      {usagePct === null ? meta.label : `${Math.round(Number(usagePct))}%`}
      {state !== "normal" && usagePct !== null && <span className="sr-only">{meta.label}</span>}
    </span>
  );
}
