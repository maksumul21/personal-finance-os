import "server-only";
import { cache } from "react";
import { todayIn } from "@/domain/period";
import type { AppUser } from "./auth";
import { ensureOccurrences } from "./services/bills.service";
import { hasDueRules, processDueRules } from "./services/recurring.service";

/** Users already brought up to date today by this server process. */
const doneToday = new Map<string, string>();

/**
 * Posts due recurring transactions and materialises upcoming bills for the signed-in user.
 * Runs at most once per user per day per server process (the daily cron covers everyone else);
 * both steps are idempotent, so running again elsewhere is harmless.
 */
export const runUserMaintenance = cache(async (user: AppUser) => {
  const today = todayIn(user.timezone);
  if (doneToday.get(user.id) === today) return;
  const ctx = { userId: user.id, baseCurrency: user.baseCurrency };
  if (await hasDueRules(user.id, today)) await processDueRules(ctx, today);
  await ensureOccurrences(user.id, today);
  doneToday.set(user.id, today);
});
