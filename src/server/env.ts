import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional().default(""),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().default(""),
  NEXT_PUBLIC_SITE_URL: z.string().optional().default("http://localhost:3000"),
  DEV_AUTH_EMAIL: z.string().optional().default(""),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;

export const supabaseConfigured = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Dev-only auth bypass (docs/DECISIONS.md D-009). Active only in `next dev` with DEV_AUTH_EMAIL set.
 * In any other environment the variable is ignored and an error is logged once.
 */
export const devAuthEmail: string | null = (() => {
  if (!env.DEV_AUTH_EMAIL) return null;
  if (env.NODE_ENV !== "development") {
    console.error("DEV_AUTH_EMAIL is set outside development and has been ignored.");
    return null;
  }
  return env.DEV_AUTH_EMAIL.toLowerCase();
})();
