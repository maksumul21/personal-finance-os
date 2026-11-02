/**
 * Display formatting only. Values arrive as decimal strings already calculated on the server;
 * nothing here does arithmetic on money.
 */

export type NumberFormatPref = "LAKH" | "INTL";

export const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR", "SAR", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];

const SYMBOLS: Record<string, string> = {
  BDT: "৳",
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  SAR: "SAR ",
  AED: "AED ",
};

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(pref: NumberFormatPref, fractionDigits: number) {
  const key = `${pref}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(pref === "LAKH" ? "en-IN" : "en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

export interface FormatMoneyOptions {
  pref?: NumberFormatPref;
  /** Show "+" for positive values. */
  signed?: boolean;
  /** Drop decimals when the value is whole (KPI cards). */
  compactDecimals?: boolean;
}

/** Formats a decimal string such as "-125000.5" → "−৳1,25,000.50". */
export function formatMoney(value: string, currency: string, opts: FormatMoneyOptions = {}): string {
  const { pref = "LAKH", signed = false, compactDecimals = false } = opts;
  const negative = value.trim().startsWith("-");
  const abs = negative ? value.trim().slice(1) : value.trim();
  const whole = /^\d+(\.0+)?$/.test(abs);
  // Intl.NumberFormat accepts decimal strings and formats them exactly (no float conversion).
  const digits = formatter(pref, compactDecimals && whole ? 0 : 2).format(abs as unknown as number);
  const sign = negative ? "−" : signed && !/^0+(\.0+)?$/.test(abs) ? "+" : "";
  return `${sign}${currencySymbol(currency)}${digits}`;
}

export function formatPercent(value: string | null, fractionDigits = 1): string {
  if (value === null) return "N/A";
  const n = formatter("INTL", fractionDigits).format(value as unknown as number);
  return `${n}%`;
}

/**
 * Short axis labels only ("৳1.2L", "৳45K"). Chart axes need numbers; exact values are always
 * shown from the decimal strings in tooltips and tables.
 */
export function formatAxisMoney(value: number, currency: string, pref: NumberFormatPref = "LAKH"): string {
  const f = new Intl.NumberFormat(pref === "LAKH" ? "en-IN" : "en-US", { notation: "compact", maximumFractionDigits: 1 });
  const sign = value < 0 ? "−" : "";
  return `${sign}${currencySymbol(currency).trim()}${f.format(Math.abs(value))}`;
}
