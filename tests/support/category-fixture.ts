/**
 * A realistic category tree for tests. New users start with no categories and create their own
 * (DECISIONS.md D-036); integration tests seed this set so they can refer to categories by name.
 * Icons are Lucide icon names; colours come from the categorical chart palette.
 */

export interface FixtureCategory {
  name: string;
  icon: string;
  color: string;
  isEssential?: boolean;
  children?: Omit<FixtureCategory, "children" | "color">[];
}

export const INCOME_FIXTURE: FixtureCategory[] = [
  { name: "Salary", icon: "briefcase", color: "#16a34a" },
  { name: "Business Income", icon: "store", color: "#0d9488" },
  { name: "Freelancing", icon: "laptop", color: "#0891b2" },
  { name: "Investment Returns", icon: "trending-up", color: "#4f46e5" },
  { name: "Rental Income", icon: "building", color: "#7c3aed" },
  { name: "Interest", icon: "percent", color: "#2563eb" },
  { name: "Gifts", icon: "gift", color: "#db2777" },
  { name: "Other Income", icon: "circle-plus", color: "#64748b" },
];

export const EXPENSE_FIXTURE: FixtureCategory[] = [
  {
    name: "Housing",
    icon: "house",
    color: "#4f46e5",
    isEssential: true,
    children: [
      { name: "Rent", icon: "key-round", isEssential: true },
      { name: "Electricity", icon: "zap", isEssential: true },
      { name: "Gas", icon: "flame", isEssential: true },
      { name: "Water", icon: "droplet", isEssential: true },
      { name: "Internet", icon: "wifi", isEssential: true },
      { name: "Maintenance", icon: "wrench" },
    ],
  },
  {
    name: "Food",
    icon: "utensils",
    color: "#ea580c",
    isEssential: true,
    children: [
      { name: "Groceries", icon: "shopping-basket", isEssential: true },
      { name: "Restaurants", icon: "utensils-crossed" },
      { name: "Coffee", icon: "coffee" },
      { name: "Food Delivery", icon: "bike" },
    ],
  },
  {
    name: "Transportation",
    icon: "car",
    color: "#0891b2",
    isEssential: true,
    children: [
      { name: "Fuel", icon: "fuel", isEssential: true },
      { name: "Public Transport", icon: "bus", isEssential: true },
      { name: "Ride Sharing", icon: "car-taxi-front" },
      { name: "Vehicle Maintenance", icon: "wrench" },
    ],
  },
  {
    name: "Personal",
    icon: "user",
    color: "#db2777",
    children: [
      { name: "Clothing", icon: "shirt" },
      { name: "Healthcare", icon: "heart-pulse", isEssential: true },
      { name: "Education", icon: "graduation-cap", isEssential: true },
      { name: "Entertainment", icon: "clapperboard" },
      { name: "Shopping", icon: "shopping-bag" },
    ],
  },
  {
    name: "Financial",
    icon: "landmark",
    color: "#64748b",
    children: [
      { name: "Loan Payments", icon: "hand-coins", isEssential: true },
      { name: "Insurance", icon: "shield-check", isEssential: true },
      { name: "Bank Charges", icon: "receipt" },
    ],
  },
  {
    name: "Lifestyle",
    icon: "sparkles",
    color: "#7c3aed",
    children: [
      { name: "Travel", icon: "plane" },
      { name: "Hobbies", icon: "palette" },
      { name: "Gifts", icon: "gift" },
      { name: "Other", icon: "ellipsis" },
    ],
  },
];
