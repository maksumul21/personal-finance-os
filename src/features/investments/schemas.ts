import { z } from "zod";

export const ASSET_CLASSES = ["STOCK", "MUTUAL_FUND", "BOND", "SAVINGS_CERTIFICATE", "FIXED_DEPOSIT", "GOLD", "CRYPTO", "OTHER"] as const;

const clean = (s: string) => s.trim().replace(/[,\s৳]/g, "");

/** Money: up to 2 dp. Zero allowed (e.g. bonus shares). */
const amount = z
  .string()
  .transform(clean)
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 5000 or 5000.50"));

/** Units and prices: up to 8 dp (fund units, crypto, gold in grams). */
const quantity = (label: string) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().regex(/^\d{1,14}(\.\d{1,8})?$/, `Enter ${label} like 10 or 10.5`));

export const holdingSchema = z.object({
  accountId: z.uuid("Choose the investment account"),
  name: z.string().trim().min(1, "Name is required").max(60, "Keep the name under 60 characters"),
  symbol: z.string().trim().max(20).default(""),
  assetClass: z.enum(ASSET_CLASSES),
  notes: z.string().trim().max(280).default(""),
});
export type HoldingInput = z.input<typeof holdingSchema>;
export type HoldingValues = z.output<typeof holdingSchema>;
export const updateHoldingSchema = z.object({ id: z.uuid(), values: holdingSchema });

export const tradeSchema = z.object({
  holdingId: z.uuid(),
  side: z.enum(["BUY", "SELL"]),
  date: z.iso.date("Pick the trade date"),
  units: quantity("units").refine((s) => /[1-9]/.test(s), "Units must be greater than zero"),
  amount,
  notes: z.string().trim().max(280).default(""),
});
export type TradeInput = z.input<typeof tradeSchema>;
export type TradeValues = z.output<typeof tradeSchema>;

export const priceSchema = z.object({
  holdingId: z.uuid(),
  date: z.iso.date("Pick the price date"),
  price: quantity("a price"),
});
export type PriceInput = z.input<typeof priceSchema>;
export type PriceValues = z.output<typeof priceSchema>;

export const idSchema = z.object({ id: z.uuid() });
