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

export function KpiCard({ label, value, icon: Icon, hint, className }: KpiCardProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight sm:text-[28px]">{value}</div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
