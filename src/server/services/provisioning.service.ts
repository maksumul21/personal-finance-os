import "server-only";
import { todayIn, dayToDb } from "@/domain/period";
import type { DbTx } from "../db";

export interface IdentityInput {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

const DEFAULT_TIMEZONE = "Asia/Dhaka";

/**
 * Creates the app-side user record on first sign-in: settings and a Cash account. No categories:
 * each user builds their own (DECISIONS.md D-036). Idempotent — returns early if the user exists.
 */
export async function provisionUser(tx: DbTx, identity: IdentityInput): Promise<void> {
  const existing = await tx.user.findUnique({ where: { id: identity.id }, select: { id: true } });
  if (existing) return;

  await tx.user.create({
    data: {
      id: identity.id,
      email: identity.email.toLowerCase(),
      name: identity.name ?? null,
      avatarUrl: identity.avatarUrl ?? null,
      timezone: DEFAULT_TIMEZONE,
      settings: { create: {} },
    },
  });
  await tx.account.create({
    data: {
      userId: identity.id,
      name: "Cash",
      type: "CASH",
      currency: "BDT",
      openingBalance: "0",
      openingDate: dayToDb(todayIn(DEFAULT_TIMEZONE)),
      icon: "banknote",
      color: "#16a34a",
    },
  });
}
