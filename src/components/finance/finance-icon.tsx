import {
  Banknote,
  Bike,
  Briefcase,
  Building,
  Building2,
  Bus,
  Car,
  CarTaxiFront,
  CircleEllipsis,
  CirclePlus,
  Clapperboard,
  Coffee,
  CreditCard,
  Droplet,
  Ellipsis,
  Flame,
  Fuel,
  Gem,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  KeyRound,
  Landmark,
  Laptop,
  type LucideIcon,
  Palette,
  Percent,
  PiggyBank,
  Plane,
  Receipt,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  User,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Curated icon set for accounts and categories, stored by name in the database.
 * A fixed map keeps bundles small and renders on the server; unknown names fall back to Tag.
 */
export const FINANCE_ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  banknote: Banknote,
  landmark: Landmark,
  "building-2": Building2,
  "piggy-bank": PiggyBank,
  smartphone: Smartphone,
  "credit-card": CreditCard,
  "hand-coins": HandCoins,
  "trending-up": TrendingUp,
  gem: Gem,
  briefcase: Briefcase,
  store: Store,
  laptop: Laptop,
  building: Building,
  percent: Percent,
  gift: Gift,
  "circle-plus": CirclePlus,
  house: House,
  "key-round": KeyRound,
  zap: Zap,
  flame: Flame,
  droplet: Droplet,
  wifi: Wifi,
  wrench: Wrench,
  utensils: Utensils,
  "shopping-basket": ShoppingBasket,
  "utensils-crossed": UtensilsCrossed,
  coffee: Coffee,
  bike: Bike,
  car: Car,
  fuel: Fuel,
  bus: Bus,
  "car-taxi-front": CarTaxiFront,
  user: User,
  shirt: Shirt,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  clapperboard: Clapperboard,
  "shopping-bag": ShoppingBag,
  "shield-check": ShieldCheck,
  receipt: Receipt,
  sparkles: Sparkles,
  plane: Plane,
  palette: Palette,
  ellipsis: Ellipsis,
  "circle-ellipsis": CircleEllipsis,
  tag: Tag,
};

export const ICON_NAMES = Object.keys(FINANCE_ICONS);

export const SWATCHES = [
  "#4f46e5",
  "#2563eb",
  "#0891b2",
  "#0d9488",
  "#16a34a",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#64748b",
];

export function FinanceIcon({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = FINANCE_ICONS[name] ?? Tag;
  const box = size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-9";
  const glyph = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-lg", box, className)}
      style={color ? { backgroundColor: `${color}1f`, color } : undefined}
    >
      <Icon className={glyph} />
    </span>
  );
}
