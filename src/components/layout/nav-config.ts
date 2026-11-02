import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  type LucideIcon,
  PiggyBank,
  Receipt,
  Scale,
  Settings,
  TrendingUp,
  Wallet,
  WalletCards,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Phase in which the module ships. Items from later phases render as "Soon" and are not links. */
  available: boolean;
}

/** PRD §3 main navigation, in order. Flip `available` as each module lands. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, available: true },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, available: true },
  { href: "/budgets", label: "Budgets", icon: WalletCards, available: true },
  { href: "/accounts", label: "Accounts", icon: Wallet, available: true },
  { href: "/goals", label: "Savings Goals", icon: PiggyBank, available: true },
  { href: "/bills", label: "Bills & Subscriptions", icon: Receipt, available: true },
  { href: "/debts", label: "Debt Management", icon: CreditCard, available: true },
  { href: "/investments", label: "Investments", icon: TrendingUp, available: true },
  { href: "/net-worth", label: "Net Worth", icon: Scale, available: false },
  { href: "/calendar", label: "Financial Calendar", icon: CalendarDays, available: false },
  { href: "/reports", label: "Reports & Analytics", icon: BarChart3, available: false },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings, available: true };

/**
 * Mobile bottom bar: two sections, the add button in the middle, one more section, then "More"
 * (the full drawer).
 */
export const MOBILE_LEFT = ["/dashboard", "/transactions"];
export const MOBILE_RIGHT = ["/budgets"];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Cookie so the server renders the sidebar in the right state (no layout flash). */
export const COLLAPSE_COOKIE = "pfos_sidebar_collapsed";
