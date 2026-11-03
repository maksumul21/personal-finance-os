"use client";

import { format, parseISO } from "date-fns";
import { ChevronDown, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatMoney, type NumberFormatPref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SafeToSpendDTO } from "@/server/queries/safe-to-spend.query";

const KIND_LABEL = { BILL: "Bill", RECURRING: "Scheduled", TRANSFER: "Transfer out", EMI: "Loan EMI" } as const;

/**
 * Safe-to-spend (D-032): what's left in the accounts marked for it after everything due before
 * the next income and this month's goal savings. Calculated from records; not financial advice.
 */
export function SafeToSpendCard({ data, currency, pref }: { data: SafeToSpendDTO; currency: string; pref: NumberFormatPref }) {
  const [open, setOpen] = useState(false);
  const fmt = (v: string) => formatMoney(v, currency, { pref, compactDecimals: true });
  const short = data.safe.startsWith("-");
  const until = format(parseISO(data.windowEnd), "d MMM");

  if (data.accounts.length === 0) {
    return (
      <section className="mt-4 rounded-2xl border bg-card shadow-card p-5 text-sm">
        <p className="font-medium">Safe to spend</p>
        <p className="mt-1 text-muted-foreground">
          No account is marked &ldquo;include in safe-to-spend&rdquo;. Turn it on for your everyday accounts in{" "}
          <Link href="/accounts" className="text-primary hover:underline">
            Accounts
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border bg-card shadow-card" aria-labelledby="sts-title">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-10 place-items-center rounded-full", short ? "bg-negative-soft text-negative" : "bg-positive-soft text-positive")}>
            {short ? <TriangleAlert className="size-5" aria-hidden /> : <ShieldCheck className="size-5" aria-hidden />}
          </span>
          <div>
            <h2 id="sts-title" className="text-sm font-medium text-muted-foreground">
              {short ? "Short before " : "Safe to spend until "}
              {data.untilIncome ? `your next income (${until})` : `${until}, month-end`}
            </h2>
            <p className={cn("tabular text-2xl font-semibold tracking-tight", short && "text-negative")}>
              {short ? fmt(data.safe.slice(1)) : fmt(data.safe)}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {data.perDay ? (
            <>
              About <span className="tabular font-medium text-foreground">{fmt(data.perDay)}</span> a day for {data.daysLeft} day{data.daysLeft === 1 ? "" : "s"}
            </>
          ) : short ? (
            Number(data.committed) + Number(data.goalSetAside) > 0 ? (
              "What's due is more than your spendable balance."
            ) : (
              "Your spendable accounts are below zero."
            )
          ) : (
            "Nothing left to spend in this period."
          )}
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          How it&apos;s worked out <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {open && (
        <div className="grid gap-6 border-t p-5 text-sm md:grid-cols-3">
          <div>
            <p className="flex justify-between font-medium">
              <span>Spendable balance</span>
              <span className="tabular">{fmt(data.available)}</span>
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {data.accounts.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span className="truncate">{a.name}</span>
                  <span className="tabular">{fmt(a.balance)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="flex justify-between font-medium">
              <span>− Due by {until}</span>
              <span className="tabular">{fmt(data.committed)}</span>
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {data.commitments.length === 0 && <li>Nothing due.</li>}
              {data.commitments.map((c, i) => (
                <li key={`${c.title}-${c.date}-${i}`} className="flex justify-between gap-3">
                  <span className="truncate">
                    {format(parseISO(c.date), "d MMM")} · {c.title} <span className="opacity-75">({KIND_LABEL[c.kind]})</span>
                  </span>
                  <span className="tabular">{fmt(c.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="flex justify-between font-medium">
              <span>− Goal savings this month</span>
              <span className="tabular">{fmt(data.goalSetAside)}</span>
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {data.goals.length === 0 && <li>Goals are on pace.</li>}
              {data.goals.map((g) => (
                <li key={g.title} className="flex justify-between gap-3">
                  <span className="truncate">{g.title}</span>
                  <span className="tabular">{fmt(g.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground md:col-span-3">
            <Link href="/forecast" className="mr-1 text-primary hover:underline">
              See the cash-flow forecast
            </Link>
            ·{" "}
            {data.unconvertedCount > 0 && `${data.unconvertedCount} item(s) left out for lack of an exchange rate. `}
            Credit-card bills count when you pay the card, not when you spend. Calculated from your records; not financial advice.
          </p>
        </div>
      )}
    </section>
  );
}
