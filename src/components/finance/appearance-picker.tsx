"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FINANCE_ICONS, SWATCHES } from "./finance-icon";

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: c }}
        >
          {value === c && <Check className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

export function IconPicker({
  value,
  onChange,
  color,
  icons,
}: {
  value: string;
  onChange: (icon: string) => void;
  color: string;
  icons: string[];
}) {
  return (
    <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1.5">
      {icons.map((name) => {
        const Icon = FINANCE_ICONS[name];
        if (!Icon) return null;
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            onClick={() => onChange(name)}
            className={cn(
              "grid size-9 place-items-center rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-transparent" : "text-muted-foreground hover:bg-muted",
            )}
            style={selected ? { backgroundColor: `${color}1f`, color, borderColor: color } : undefined}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
