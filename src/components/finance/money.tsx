import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MoneyTone = "auto" | "neutral" | "positive" | "negative";

interface MoneyProps {
  /** Decimal string calculated on the server. */
  value: string;
  currency: string;
  pref?: NumberFormatPref;
  signed?: boolean;
  compactDecimals?: boolean;
  /**
   * auto: negative values red, others neutral. Ordinary expenses should pass "neutral";
   * red is reserved for overspend / negative balances.
   */
  tone?: MoneyTone;
  className?: string;
}

export function Money({ value, currency, pref, signed, compactDecimals, tone = "neutral", className }: MoneyProps) {
  const negative = value.trim().startsWith("-");
  const color =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "auto" && negative
          ? "text-negative"
          : undefined;
  return (
    <span className={cn("tabular whitespace-nowrap", color, className)}>
      {formatMoney(value, currency, { pref, signed, compactDecimals })}
    </span>
  );
}
