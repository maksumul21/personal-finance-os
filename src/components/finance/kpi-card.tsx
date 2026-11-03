import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Short explanation of how the number is calculated or what it covers. */
  hint?: React.ReactNode;
  className?: string;
}

/** Icon in a soft tinted tile; shared by KPI tiles across pages so they read as one system. */
export function KpiIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground ring-1 ring-primary/10">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

export function KpiCard({ label, value, icon, hint, className }: KpiCardProps) {
  return (
    <div className={cn("rounded-2xl border bg-card p-5 shadow-card", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon && <KpiIcon icon={icon} />}
      </div>
      <div className="figure mt-3 text-2xl font-semibold sm:text-[28px]">{value}</div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
