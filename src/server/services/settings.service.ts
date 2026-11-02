import "server-only";
import type { z } from "zod";
import type { preferencesSchema } from "@/features/settings/schemas";
import { UserFacingError } from "../action";
import { audit } from "../audit";
import { db } from "../db";

export async function updateProfile(userId: string, name: string) {
  await db.user.update({ where: { id: userId }, data: { name: name || null } });
}

export async function updatePreferences(userId: string, values: z.output<typeof preferencesSchema>) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { settings: true } });
    if (user.baseCurrency !== values.baseCurrency) {
      // Base amounts are recorded at entry time; changing the base would silently invalidate them.
      const txCount = await tx.transaction.count({ where: { userId } });
      if (txCount > 0) {
        throw new UserFacingError(
          "Base currency can't change after transactions are recorded.",
          "baseCurrency",
        );
      }
    }
    const { baseCurrency, timezone, ...settings } = values;
    await tx.user.update({ where: { id: userId }, data: { baseCurrency, timezone } });
    await tx.userSettings.upsert({ where: { userId }, create: { userId, ...settings }, update: settings });
    await audit(tx, userId, "settings.update", "UserSettings", userId, user.settings, values);
  });
}

export async function updateTheme(userId: string, theme: "LIGHT" | "DARK" | "SYSTEM") {
  await db.userSettings.upsert({ where: { userId }, create: { userId, theme }, update: { theme } });
}
