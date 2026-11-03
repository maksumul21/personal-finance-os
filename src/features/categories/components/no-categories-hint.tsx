import { Tags } from "lucide-react";
import Link from "next/link";

/**
 * Shown in place of a category picker when the user hasn't created any categories of that kind
 * yet (new users start with none, DECISIONS.md D-036).
 */
export function NoCategoriesHint({ kind }: { kind: "INCOME" | "EXPENSE" }) {
  const word = kind === "INCOME" ? "income" : "expense";
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 text-sm">
      <Tags className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-muted-foreground">
        No {word} categories yet.{" "}
        <Link href={`/settings/categories?tab=${kind}`} className="font-medium text-primary hover:underline">
          Create one
        </Link>{" "}
        (for example {kind === "INCOME" ? "Salary" : "Food, with Lunch and Dinner inside"}), then come back.
      </p>
    </div>
  );
}
