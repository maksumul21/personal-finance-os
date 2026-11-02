import "server-only";
import { z } from "zod";
import { LedgerError } from "@/domain/ledger";
import { Prisma } from "@/generated/prisma/client";
import { requireUser, type AppUser } from "./auth";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** A business-rule violation whose message is safe to show to the user. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Wraps a server action: authenticates, validates input with Zod on the server (authoritative),
 * and converts known errors into a typed result. Unknown errors are logged, not leaked.
 */
export function defineAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>, user: AppUser) => Promise<T>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    const user = await requireUser();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
    }
    try {
      return { ok: true, data: await handler(parsed.data, user) };
    } catch (err) {
      if (err instanceof UserFacingError) {
        return { ok: false, error: err.message, fieldErrors: err.field ? { [err.field]: [err.message] } : undefined };
      }
      if (err instanceof LedgerError) return { ok: false, error: err.message };
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") return { ok: false, error: "A record with this name already exists." };
        if (err.code === "P2025") return { ok: false, error: "That record no longer exists." };
      }
      console.error("Server action failed", err);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
