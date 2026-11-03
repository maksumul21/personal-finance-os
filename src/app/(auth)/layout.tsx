import { CalendarDays, PieChart, ShieldCheck, TrendingUp } from "lucide-react";
import { Logo } from "@/components/layout/logo";

const POINTS = [
  { icon: PieChart, title: "Every taka accounted for", body: "Accounts, budgets and goals on one ledger, so totals always add up." },
  { icon: CalendarDays, title: "See what's coming", body: "Bills, EMIs and a cash-flow forecast before they surprise you." },
  { icon: TrendingUp, title: "Know your net worth", body: "Investments at market value, loans and assets in one picture." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel: large screens only */}
      <aside className="relative hidden overflow-hidden border-r bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 size-[520px] rounded-full bg-[radial-gradient(closest-side,var(--page-glow),transparent)] opacity-90"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -bottom-48 size-[480px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--chart-3)_14%,transparent),transparent)]"
        />
        <Logo />
        <div className="relative max-w-md">
          <h2 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.03em]">Your money, calm and in order.</h2>
          <p className="mt-3 text-[15px] text-muted-foreground">
            A personal finance workspace built for how money really moves in Bangladesh: bKash, cards, EMIs and all.
          </p>
          <ul className="mt-10 space-y-5">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-card text-primary shadow-card">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden /> Your financial data is private to your account and never shared.
        </p>
      </aside>

      {/* Form */}
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-[400px]">{children}</div>
        <p className="mt-10 max-w-sm text-center text-xs text-muted-foreground lg:hidden">
          Your financial data is private to your account and never shared.
        </p>
      </main>
    </div>
  );
}
