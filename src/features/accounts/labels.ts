import type { AccountType } from "@/domain/accounts";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Cash",
  BANK: "Bank account",
  SAVINGS: "Savings account",
  MFS: "Mobile financial service",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan",
  INVESTMENT: "Investment account",
  OTHER_ASSET: "Other asset",
};

export const PROVIDER_LABELS: Record<string, string> = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  OTHER: "Other",
};

export interface AccountPreset {
  key: string;
  name: string;
  type: AccountType;
  provider?: "BKASH" | "NAGAD" | "ROCKET";
  icon: string;
  color: string;
}

/** PRD §7.1 default types and Bangladesh presets. */
export const ACCOUNT_PRESETS: AccountPreset[] = [
  { key: "cash", name: "Cash", type: "CASH", icon: "banknote", color: "#16a34a" },
  { key: "bank", name: "Bank", type: "BANK", icon: "landmark", color: "#2563eb" },
  { key: "savings", name: "Savings", type: "SAVINGS", icon: "piggy-bank", color: "#0d9488" },
  { key: "bkash", name: "bKash", type: "MFS", provider: "BKASH", icon: "smartphone", color: "#db2777" },
  { key: "nagad", name: "Nagad", type: "MFS", provider: "NAGAD", icon: "smartphone", color: "#ea580c" },
  { key: "rocket", name: "Rocket", type: "MFS", provider: "ROCKET", icon: "smartphone", color: "#7c3aed" },
  { key: "card", name: "Credit card", type: "CREDIT_CARD", icon: "credit-card", color: "#64748b" },
];
