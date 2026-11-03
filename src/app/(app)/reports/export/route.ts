import { NextResponse, type NextRequest } from "next/server";
import { todayIn } from "@/domain/period";
import { toCsv } from "@/domain/reports";
import { reportParamsSchema, resolveReportPeriod } from "@/features/reports/params";
import { requireUser } from "@/server/auth";
import { getReport } from "@/server/queries/reports.query";

/** CSV of the report for the requested period. Signed-in users only; never cached. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const params = reportParamsSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const { period } = resolveReportPeriod(params, todayIn(user.timezone));
  const r = await getReport(user.id, user.baseCurrency, period, todayIn(user.timezone));
  const c = r.baseCurrency;

  const rows: (string | number | null)[][] = [
    ["Personal Finance OS report", `${r.current.start} to ${r.current.end}`, `Compared with ${r.previous.start} to ${r.previous.end}`, `Amounts in ${c}`],
    [],
    ["Summary", "This period", "Previous period", "Change %"],
    ["Income", r.summary.income, r.summary.previousIncome, r.summary.incomeChangePct],
    ["Expenses", r.summary.expenses, r.summary.previousExpenses, r.summary.expensesChangePct],
    ["Net saved", r.summary.net, r.summary.previousNet, null],
    ["Savings rate %", r.summary.savingsRate, null, null],
    ["Expense-to-income %", r.summary.expenseToIncome, null, null],
    ["Average daily spending", r.summary.avgDailySpend, null, null],
    [],
    ["Spending by category", "Subcategory", "This period", "Previous period", "Change %", "Share %"],
  ];
  for (const g of r.spending) {
    rows.push([g.name, null, g.amount, g.previous, g.changePct, g.sharePct]);
    for (const k of g.children) rows.push([g.name, k.name, k.amount, k.previous, k.changePct, k.sharePct]);
  }
  rows.push([], ["Income by category", "Subcategory", "This period", "Previous period", "Change %", "Share %"]);
  for (const g of r.income) {
    rows.push([g.name, null, g.amount, g.previous, g.changePct, g.sharePct]);
    for (const k of g.children) rows.push([g.name, k.name, k.amount, k.previous, k.changePct, k.sharePct]);
  }
  rows.push([], ["Month", "Income", "Expenses", "Net", "Savings rate %"]);
  for (const m of r.months) rows.push([m.month, m.income, m.expenses, m.net, m.savingsRate]);
  rows.push([], ["Account", "Money in", "Money out", "Net"]);
  for (const a of r.accounts) rows.push([a.name, a.moneyIn, a.moneyOut, a.net]);

  // The byte-order mark makes Excel read the file as UTF-8 (e.g. Bangla category names).
  return new NextResponse(`﻿${toCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${r.current.start}-to-${r.current.end}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
