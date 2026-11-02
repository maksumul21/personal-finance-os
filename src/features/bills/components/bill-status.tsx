import { AlarmClock, CalendarClock, CheckCircle2, CircleAlert, SkipForward } from "lucide-react";
import type { BillStatus } from "@/domain/bills";
import { cn } from "@/lib/utils";

/** Status is always icon + word; colour is never the only signal. */
export const BILL_STATUS: Record<BillStatus, { label: string; icon: typeof CircleAlert; cls: string; chip: string }> = {
  OVERDUE: { label: "Overdue", icon: CircleAlert, cls: "text-negative", chip: "bg-negative-soft text-negative" },
  DUE_TODAY: { label: "Due today", icon: AlarmClock, cls: "text-warning", chip: "bg-warning-soft text-foreground" },
  UPCOMING: { label: "Upcoming", icon: CalendarClock, cls: "text-muted-foreground", chip: "bg-muted text-muted-foreground" },
  PAID: { label: "Paid", icon: CheckCircle2, cls: "text-positive", chip: "bg-positive-soft text-positive" },
  SKIPPED: { label: "Skipped", icon: SkipForward, cls: "text-muted-foreground", chip: "bg-muted text-muted-foreground line-through" },
};

export function StatusLabel({ status }: { status: BillStatus }) {
  const m = BILL_STATUS[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", m.cls)}>
      <Icon className="size-3.5" aria-hidden /> {m.label}
    </span>
  );
}

