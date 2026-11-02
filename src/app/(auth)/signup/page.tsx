import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/features/auth/components/auth-forms";
import { authMode } from "@/server/auth";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  if (authMode() === "dev") redirect("/dashboard");
  return <SignupForm />;
}
