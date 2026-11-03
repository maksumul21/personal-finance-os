"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, signInWithPassword, signUp, type AuthFormState } from "../actions";

function FormStatus({ state }: { state: AuthFormState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-negative-soft px-3 py-2 text-sm text-negative">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded-md bg-positive-soft px-3 py-2 text-sm text-positive">
        {state.message}
      </p>
    );
  return null;
}

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPassword, undefined);
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, undefined);
  const state = mode === "password" ? passwordState : magicState;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl tracking-[-0.025em]">Sign in</CardTitle>
        <CardDescription>Welcome back to Personal Finance OS.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkError && !state && (
          <FormStatus
            state={{
              error:
                "That link couldn’t sign you in here. If you just confirmed your email, sign in with your password. Otherwise, request a new link.",
            }}
          />
        )}
        <FormStatus state={state} />
        <form action={mode === "password" ? passwordAction : magicAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
          </div>
          {mode === "password" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} className="h-10" />
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={passwordPending || magicPending}>
            {mode === "password"
              ? passwordPending
                ? "Signing in…"
                : "Sign in"
              : magicPending
                ? "Sending link…"
                : "Email me a sign-in link"}
          </Button>
        </form>
        <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => setMode(mode === "password" ? "magic" : "password")}
        >
          {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl tracking-[-0.025em]">Create your account</CardTitle>
        <CardDescription>Track, budget and plan in one place.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormStatus state={state} />
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" autoComplete="name" className="h-10" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="h-10" />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
