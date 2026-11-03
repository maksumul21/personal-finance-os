import { afterAll, afterEach, describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "@/domain/budget";
import { allocationFormSchema, budgetFormSchema, type AllocationFormInput, type BudgetFormInput } from "@/features/budgets/schemas";
import { transactionFormSchema, type TransactionFormInput } from "@/features/transactions/schemas";
import { UserFacingError } from "@/server/action";
import { db } from "@/server/db";
import { getActiveBudget, getBudgetDetail } from "@/server/queries/budgets.query";
import { getDashboard } from "@/server/queries/dashboard.query";
import { createAccount } from "@/server/services/accounts.service";
import { addAllocation, createBudget, deleteAllocation } from "@/server/services/budgets.service";
import { createTransaction } from "@/server/services/transactions.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

const budget = (v: BudgetFormInput) => budgetFormSchema.parse(v);
const line = (v: AllocationFormInput) => allocationFormSchema.parse(v);
const tx = (v: TransactionFormInput) => transactionFormSchema.parse(v);

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const bank = (await createAccount(userId, accountValues({ name: "Bank", openingBalance: "100000" }))).id;
  const cat = async (name: string, parent = false) =>
    (await db.category.findFirstOrThrow({ where: { userId, name, ...(parent ? { parentId: null } : {}) } })).id;
  return { userId, ctx, bank, cat };
}

describe("budgets", () => {
  it("PRD §6.1/§6.4: ৳50,000 fully allocated is a completed zero-based plan; savings lines move no money", async () => {
    const s = await setup();
    const { id } = await createBudget(
      s.userId,
      budget({ name: "November", periodType: "MONTHLY", start: "2026-11-15", method: "ZERO_BASED", incomeSource: "PLANNED", plannedIncome: "50,000" }),
      6,
    );
    const plan: [string, string][] = [
      ["Housing", "12000"],
      ["Food", "8000"],
      ["Transportation", "3000"],
      ["Personal", "4000"],
      ["Lifestyle", "5000"],
    ];
    for (const [name, amount] of plan) {
      await addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: await s.cat(name, true), allocatedAmount: amount }));
    }
    await addAllocation(s.userId, line({ budgetId: id, kind: "SAVINGS", label: "Emergency fund", allocatedAmount: "5000" }));
    await addAllocation(s.userId, line({ budgetId: id, kind: "INVESTMENT", label: "DPS", allocatedAmount: "5000" }));
    await addAllocation(s.userId, line({ budgetId: id, kind: "SAVINGS", label: "Other savings", allocatedAmount: "8000" }));

    const d = (await getBudgetDetail(s.userId, id, DEFAULT_THRESHOLDS))!;
    expect([d.start, d.end]).toEqual(["2026-11-01", "2026-11-30"]);
    expect(d.zeroBased).toEqual({ totalAllocated: "50000.00", unallocated: "0.00", status: "complete" });
    expect(d.totals.expenseBudget).toBe("32000.00");
    expect(await db.ledgerEntry.count({ where: { userId: s.userId } })).toBe(0);
  });

  it("budget vs actual: groups include subcategories, refunds reduce spending, transfers never count", async () => {
    const s = await setup();
    const bkash = (await createAccount(s.userId, accountValues({ name: "bKash", type: "MFS", provider: "BKASH" }))).id;
    const { id } = await createBudget(
      s.userId,
      budget({ name: "Nov", periodType: "MONTHLY", start: "2026-11-01", method: "STANDARD", incomeSource: "ACTUAL", plannedIncome: "" }),
      6,
    );
    const food = await s.cat("Food", true);
    await addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: food, allocatedAmount: "8000" }));

    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: await s.cat("Groceries"), amount: "5000", date: "2026-11-03" }));
    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: await s.cat("Restaurants"), amount: "2600", date: "2026-11-09" }));
    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: await s.cat("Groceries"), amount: "400", isRefund: true, date: "2026-11-10" }));
    await createTransaction(s.ctx, tx({ type: "TRANSFER", fromAccountId: s.bank, toAccountId: bkash, amount: "9000", date: "2026-11-10" }));
    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: await s.cat("Rent"), amount: "15000", date: "2026-11-01" }));
    // Outside the period
    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: await s.cat("Groceries"), amount: "999", date: "2026-10-31" }));

    const d = (await getBudgetDetail(s.userId, id, DEFAULT_THRESHOLDS))!;
    const f = d.lines[0];
    expect([f.spent, f.remaining, f.usagePct, f.state]).toEqual(["7200.00", "800.00", "90.0", "critical"]);
    expect(d.totals.unbudgeted).toBe("15000.00");
    expect(f.previousSpent).toBe("999.00");
  });

  it("rollover carries unused budget from consecutive periods, never overspending", async () => {
    const s = await setup();
    const food = await s.cat("Food", true);
    const mk = async (start: string) => {
      const { id } = await createBudget(
        s.userId,
        budget({ name: start, periodType: "MONTHLY", start, method: "STANDARD", incomeSource: "ACTUAL", plannedIncome: "" }),
        6,
      );
      await addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: food, allocatedAmount: "5000", rolloverEnabled: true }));
      return id;
    };
    await mk("2026-09-01");
    await mk("2026-10-01");
    const nov = await mk("2026-11-01");
    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: food, amount: "6000", date: "2026-09-10" })); // over by 1,000
    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: food, amount: "3200", date: "2026-10-10" })); // 1,800 left

    const d = (await getBudgetDetail(s.userId, nov, DEFAULT_THRESHOLDS))!;
    // September's overspend is not carried; October carries 1,800 into November.
    expect([d.lines[0].carry, d.lines[0].available]).toEqual(["1800.00", "6800.00"]);
  });

  it("prevents limiting a group and its own subcategory in the same budget", async () => {
    const s = await setup();
    const { id } = await createBudget(
      s.userId,
      budget({ name: "Nov", periodType: "MONTHLY", start: "2026-11-01", method: "STANDARD", incomeSource: "ACTUAL", plannedIncome: "" }),
      6,
    );
    await addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: await s.cat("Food", true), allocatedAmount: "100" }));
    await expect(
      addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: await s.cat("Coffee"), allocatedAmount: "10" })),
    ).rejects.toThrow(/already includes/);
    await expect(
      addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: await s.cat("Salary"), allocatedAmount: "10" })),
    ).rejects.toThrow(/expense categories/);
  });

  it("allows limits on several subcategories of one group, then refuses the group itself", async () => {
    const s = await setup();
    const { id } = await createBudget(
      s.userId,
      budget({ name: "Nov", periodType: "MONTHLY", start: "2026-11-01", method: "STANDARD", incomeSource: "ACTUAL", plannedIncome: "" }),
      6,
    );
    await addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: await s.cat("Groceries"), allocatedAmount: "6000" }));
    await addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: await s.cat("Restaurants"), allocatedAmount: "2000" }));
    await expect(
      addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: await s.cat("Food", true), allocatedAmount: "100" })),
    ).rejects.toThrow(/already limited inside/);
    const d = (await getBudgetDetail(s.userId, id, DEFAULT_THRESHOLDS))!;
    expect(d.lines.map((l) => l.name).sort()).toEqual(["Groceries", "Restaurants"]);
  });

  it("50/30/20 creates the savings line from planned income; templates report bucket targets", async () => {
    const s = await setup();
    const { id } = await createBudget(
      s.userId,
      budget({ name: "Nov", periodType: "MONTHLY", start: "2026-11-01", method: "FIFTY_THIRTY_TWENTY", incomeSource: "PLANNED", plannedIncome: "60000" }),
      6,
    );
    await addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: await s.cat("Housing", true), allocatedAmount: "25000" }));
    const d = (await getBudgetDetail(s.userId, id, DEFAULT_THRESHOLDS))!;
    expect(d.lines.find((l) => l.kind === "SAVINGS")?.allocated).toBe("12000.00");
    expect(d.buckets).toEqual([
      { bucket: "needs", targetPct: 50, target: "30000.00", planned: "25000.00", difference: "5000.00" },
      { bucket: "wants", targetPct: 30, target: "18000.00", planned: "0.00", difference: "18000.00" },
      { bucket: "savings", targetPct: 20, target: "12000.00", planned: "12000.00", difference: "0.00" },
    ]);
  });

  it("dashboard: remaining budget, savings rate and insights come from real records", async () => {
    const s = await setup();
    const { id } = await createBudget(
      s.userId,
      budget({ name: "Nov", periodType: "MONTHLY", start: "2026-11-01", method: "STANDARD", incomeSource: "ACTUAL", plannedIncome: "" }),
      6,
    );
    const food = await s.cat("Food", true);
    await addAllocation(s.userId, line({ budgetId: id, kind: "EXPENSE_CATEGORY", categoryId: food, allocatedAmount: "10000" }));
    await createTransaction(s.ctx, tx({ type: "INCOME", accountId: s.bank, categoryId: await s.cat("Salary"), amount: "50000", date: "2026-11-01" }));
    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: await s.cat("Groceries"), amount: "8600", date: "2026-11-02" }));
    await createTransaction(s.ctx, tx({ type: "EXPENSE", accountId: s.bank, categoryId: await s.cat("Rent"), amount: "26400", date: "2026-11-02" }));

    const d = await getDashboard({
      userId: s.userId,
      baseCurrency: "BDT",
      today: "2026-11-02",
      period: { start: "2026-11-01", end: "2026-11-30" },
      trendMonths: 6,
      thresholds: DEFAULT_THRESHOLDS,
      pref: "LAKH",
    });
    expect([d.kpis.income, d.kpis.expenses, d.kpis.savings, d.kpis.savingsRate]).toEqual(["50000.00", "35000.00", "15000.00", "30.0"]);
    expect(d.kpis.remainingBudget).toBe("1400.00");
    expect(d.kpis.totalBalance).toBe("115000.00");
    expect(d.months.at(-1)).toMatchObject({ month: "2026-11", income: "50000.00", expenses: "35000.00", netWorth: "115000.00" });
    expect(d.breakdown.map((b) => [b.name, b.pct])).toEqual([
      ["Housing", "75.4"],
      ["Food", "24.6"],
    ]);
    expect(d.insights.map((i) => i.key)).toContain("budget:Food");
    expect(d.insights.find((i) => i.key === "budget:Food")?.message).toMatch(/86% of your Food budget/);
    // Not enough history for a month-over-month comparison.
    expect(d.insights.map((i) => i.key)).not.toContain("expense-change");
  });

  it("isolates budgets between users", async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await createBudget(
      a.userId,
      budget({ name: "A", periodType: "MONTHLY", start: "2026-11-01", method: "STANDARD", incomeSource: "ACTUAL", plannedIncome: "" }),
      6,
    );
    const { id: lineId } = await addAllocation(a.userId, line({ budgetId: id, kind: "SAVINGS", label: "x", allocatedAmount: "1" }));
    expect(await getBudgetDetail(b.userId, id, DEFAULT_THRESHOLDS)).toBeNull();
    expect(await getActiveBudget(b.userId, "2026-11-02", DEFAULT_THRESHOLDS)).toBeNull();
    await expect(addAllocation(b.userId, line({ budgetId: id, kind: "SAVINGS", label: "y", allocatedAmount: "1" }))).rejects.toBeInstanceOf(UserFacingError);
    await expect(deleteAllocation(b.userId, lineId)).rejects.toBeInstanceOf(UserFacingError);
  });
});
