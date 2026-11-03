import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-[oklch(0.42_0.2_290)] text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25),0_1px_2px_0_rgb(16_24_40/0.2)]",
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
      {!collapsed && (
        <span className={cn("text-[15px] font-semibold tracking-[-0.02em]", textClassName)}>
          Finance<span className="text-muted-foreground font-medium"> OS</span>
        </span>
      )}
    </span>
  );
}
