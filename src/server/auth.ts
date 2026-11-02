import "server-only";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "./db";
import { devAuthEmail, supabaseConfigured } from "./env";
import { provisionUser, type IdentityInput } from "./services/provisioning.service";

/** Stable UUID for the dev-bypass user, derived from the email. */
function devUserId(email: string): string {
  const h = createHash("sha256").update(`pfos-dev:${email}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The signed-in identity, or null. Never trusts client input. */
export const getIdentity = cache(async (): Promise<IdentityInput | null> => {
  if (devAuthEmail) return { id: devUserId(devAuthEmail), email: devAuthEmail, name: "Dev User" };
  if (!supabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const meta = user.user_metadata as { full_name?: string; name?: string; avatar_url?: string } | undefined;
  return { id: user.id, email: user.email, name: meta?.full_name ?? meta?.name ?? null, avatarUrl: meta?.avatar_url };
});

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  baseCurrency: string;
  timezone: string;
}

/**
 * Returns the current user, provisioning them on first visit. Redirects to /login when signed out.
 * Call at the top of every protected page, query and server action.
 */
export const requireUser = cache(async (): Promise<AppUser> => {
  const identity = await getIdentity();
  if (!identity) redirect("/login");

  let user = await db.user.findUnique({ where: { id: identity.id } });
  if (!user) {
    try {
      await db.$transaction((tx) => provisionUser(tx, identity));
    } catch (err) {
      // Two first requests can race; the loser hits the unique constraint and just reads the winner's row.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
    user = await db.user.findUniqueOrThrow({ where: { id: identity.id } });
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    baseCurrency: user.baseCurrency,
    timezone: user.timezone,
  };
});

export const authMode = (): "supabase" | "dev" | "unconfigured" =>
  devAuthEmail ? "dev" : supabaseConfigured ? "supabase" : "unconfigured";
