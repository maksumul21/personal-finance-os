import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        <path d="M5 17V11M10 17V7M15 17v-4M20 17V9" />
      </svg>
    </span>
  );
}

export function Logo({ collapsed = false, textClassName }: { collapsed?: boolean; textClassName?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && <span className={cn("text-[15px] font-semibold tracking-tight", textClassName)}>Finance OS</span>}
    </span>
  );
}
