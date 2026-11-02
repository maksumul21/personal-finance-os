"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authMode } from "@/server/auth";
import { env } from "@/server/env";

export type AuthFormState = { error?: string; message?: string } | undefined;

const credentials = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** Only allow same-origin relative redirects after login. */
const safeNext = (value: FormDataEntryValue | null) => safeRedirectPath(value);

function notConfigured(): AuthFormState {
  return { error: "Authentication is not configured. Add your Supabase keys to .env (see .env.example)." };
}

export async function signInWithPassword(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (authMode() !== "supabase") return notConfigured();
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error?.code === "email_not_confirmed") {
    return { error: "Please confirm your email first. Check your inbox for the link." };
  }
  // Otherwise deliberately generic: don't reveal whether the email exists.
  if (error) return { error: "Incorrect email or password." };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (authMode() !== "supabase") return notConfigured();
  const parsed = credentials
    .extend({ name: z.string().trim().max(80).optional() })
    .safeParse({ email: form.get("email"), password: form.get("password"), name: form.get("name") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/dashboard");
  return { message: "Check your email to confirm your account, then sign in." };
}

export async function sendMagicLink(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (authMode() !== "supabase") return notConfigured();
  const parsed = z.email("Enter a valid email").safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const next = safeNext(form.get("next"));
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: "Couldn't send the link. Please try again in a minute." };
  return { message: "Check your email for a sign-in link." };
}

export async function signOut() {
  if (authMode() === "supabase") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
