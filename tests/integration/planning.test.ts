import { afterAll, afterEach, describe, expect, it } from "vitest";
import { billFormSchema, type BillFormInput } from "@/features/bills/schemas";
import { contributionSchema, goalFormSchema, type ContributionInput, type GoalFormInput } from "@/features/goals/schemas";
import { recurringFormSchema, type RecurringFormInput } from "@/features/recurring/schemas";
import { transactionFormSchema } from "@/features/transactions/schemas";
import { UserFacingError } from "@/server/action";
import { db } from "@/server/db";
import { getAccountsOverview } from "@/server/queries/accounts.query";
import { getBills, getUpcomingBills, subscriptionSummary } from "@/server/queries/bills.query";
import { getGoals } from "@/server/queries/goals.query";
import { getTransactionPage } from "@/server/queries/transactions.query";
import { createAccount, deleteAccount, setAccountArchived } from "@/server/services/accounts.service";
import { createBill, ensureOccurrences, payBill, setBillStatus, unpayBill } from "@/server/services/bills.service";
import { addContribution, createGoal, deleteContribution, updateContribution } from "@/server/services/goals.service";
import { createRecurring, deleteRecurring, processDueRules, setRecurringStatus } from "@/server/services/recurring.service";
import { createTransaction, deleteTransaction, updateTransaction } from "@/server/services/transactions.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

const goal = (v: GoalFormInput) => goalFormSchema.parse(v);
const contrib = (v: ContributionInput) => contributionSchema.parse(v);
const rule = (v: RecurringFormInput) => recurringFormSchema.parse(v);
const bill = (v: BillFormInput) => billFormSchema.parse(v);

async function setup() {
  const userId = await createTestUser();
  const ctx = { userId, baseCurrency: "BDT" };
  const bank = (await createAccount(userId, accountValues({ name: "Bank", openingBalance: "100000" }))).id;
  const savings = (await createAccount(userId, accountValues({ name: "Savings", type: "SAVINGS", openingBalance: "0" }))).id;
  const cat = async (name: string) => (await db.category.findFirstOrThrow({ where: { userId, name } })).id;
  const balances = async () =>
    Object.fromEntries((await getAccountsOverview(userId, "BDT")).accounts.map((a) => [a.name, a.balance])) as Record<string, string>;
  const totals = async (from: string, to: string) => (await getTransactionPage(userId, { sort: "date_desc", page: 1, from, to })).summary;
  return { userId, ctx, bank, savings, cat, balances, totals };
}

describe("savings goals", () => {
  it("contributions from another account are real transfers; they never count as expenses", async () => {
    const s = await setup();
    const { id } = await createGoal(
      s.userId,
      goal({ name: "Laptop", goalType: "SINKING_FUND", targetAmount: "120000", targetDate: "2027-10-31", icon: "laptop", color: "#2563eb", priority: "MEDIUM", linkedAccountId: s.savings }),
    );
    await addContribution(s.ctx, contrib({ goalId: id, direction: "DEPOSIT", amount: "20000", date: "2026-11-02", accountId: s.bank }));
    await addContribution(s.ctx, contrib({ goalId: id, direction: "DEPOSIT", amount: "10000", date: "2026-11-03" })); // earmark only

    expect(await s.balances()).toMatchObject({ Bank: "80000.00", Savings: "20000.00" });
    expect(await s.totals("2026-11-01", "2026-11-30")).toMatchObject({ income: "0.00", expenses: "0.00" });

    const [g] = await getGoals(s.userId, "2026-11-03");
    expect([g.saved, g.remaining, g.progressPct, g.requiredMonthly]).toEqual(["30000.00", "90000.00", "25.0", "7500.00"]);
    expect(g.contributions.map((c) => c.otherAccount)).toEqual([null, "Bank"]);
  });

  it("withdrawals are capped at the saved amount; editing and deleting keep the ledger in sync", async () => {
    const s = await setup();
    const { id } = await createGoal(
      s.userId,
      goal({ name: "Travel", goalType: "GOAL", targetAmount: "50000", targetDate: "2027-06-30", icon: "plane", color: "#2563eb", priority: "LOW", linkedAccountId: s.savings }),
    );
    const dep = await addContribution(s.ctx, contrib({ goalId: id, direction: "DEPOSIT", amount: "15000", date: "2026-11-02", accountId: s.bank }));
    await expect(addContribution(s.ctx, contrib({ goalId: id, direction: "WITHDRAWAL", amount: "15000.01", date: "2026-11-05", accountId: s.bank }))).rejects.toThrow(/at most/);
    await addContribution(s.ctx, contrib({ goalId: id, direction: "WITHDRAWAL", amount: "5000", date: "2026-11-05", accountId: s.bank }));
    expect(await s.balances()).toMatchObject({ Bank: "90000.00", Savings: "10000.00" });

    await updateContribution(s.ctx, { id: dep.id, amount: "12000", date: "2026-11-02", notes: "" });
    expect(await s.balances()).toMatchObject({ Bank: "93000.00", Savings: "7000.00" });

    // The deposit can't go while a later withdrawal depends on it.
    await expect(updateContribution(s.ctx, { id: dep.id, amount: "4000", date: "2026-11-02", notes: "" })).rejects.toThrow(/below zero/);
    await expect(deleteContribution(s.ctx, dep.id)).rejects.toThrow(/withdrawals/);

    // A goal's transfer can't be changed behind its back from the Transactions page.
    const c = await db.goalContribution.findUniqueOrThrow({ where: { id: dep.id } });
    await expect(deleteTransaction(s.ctx, c.transactionId!)).rejects.toThrow(/from the goal/);
  });

  it("PRD §8.4 emergency fund target = essentials × months", async () => {
    const s = await setup();
    await createGoal(
      s.userId,
      goal({ name: "Emergency fund", goalType: "EMERGENCY_FUND", targetAmount: "", essentialMonthly: "30,000", targetMonths: 6, icon: "shield-check", color: "#0d9488", priority: "HIGH", linkedAccountId: s.savings }),
    );
    const [g] = await getGoals(s.userId, "2026-11-02");
    expect([g.target, g.monthsCovered, g.pace]).toEqual(["180000.00", "0.0", "no-date"]);
  });
});

describe("recurring transactions", () => {
  it("posts due occurrences once, even when the processor runs twice", async () => {
    const s = await setup();
    const rent = await s.cat("Rent");
    const { id } = await createRecurring(
      s.ctx,
      rule({ type: "EXPENSE", amount: "15000", accountId: s.bank, categoryId: rent, unit: "MONTHLY", interval: 1, startDate: "2026-09-01" }),
      "2026-11-02",
    );
    // Created with a past start date: Sep, Oct, Nov are posted immediately.
    expect(await db.transaction.count({ where: { recurringRuleId: id } })).toBe(3);
    expect(await processDueRules(s.ctx, "2026-11-02")).toMatchObject({ posted: 0 });

    // Simulate a stale pointer (e.g. a crashed run) — the unique key still prevents duplicates.
    await db.recurringRule.update({ where: { id }, data: { nextOccurrence: new Date("2026-09-01T00:00:00Z") } });
    const r = await processDueRules(s.ctx, "2026-11-02");
    expect([r.posted, r.skippedDuplicates]).toEqual([0, 3]);
    expect(await db.transaction.count({ where: { recurringRuleId: id } })).toBe(3);

    // Concurrent runs for the next month.
    const both = await Promise.all([processDueRules(s.ctx, "2026-12-01"), processDueRules(s.ctx, "2026-12-01")]);
    expect(both[0].posted + both[1].posted).toBe(1);
    expect(await db.transaction.count({ where: { recurringRuleId: id } })).toBe(4);
    expect((await s.balances()).Bank).toBe("40000.00");
  });

  it("pause skips missed occurrences on resume; an archived account pauses the rule", async () => {
    const s = await setup();
    const salary = await s.cat("Salary");
    const { id } = await createRecurring(
      s.ctx,
      rule({ type: "INCOME", amount: "50000", accountId: s.bank, categoryId: salary, unit: "MONTHLY", interval: 1, startDate: "2026-11-25" }),
      "2026-11-02",
    );
    await setRecurringStatus(s.ctx, id, "PAUSED", "2026-11-02");
    expect(await processDueRules(s.ctx, "2027-01-30")).toMatchObject({ posted: 0 });
    await setRecurringStatus(s.ctx, id, "ACTIVE", "2027-01-30");
    expect((await db.recurringRule.findUniqueOrThrow({ where: { id } })).nextOccurrence?.toISOString().slice(0, 10)).toBe("2027-02-25");

    await setAccountArchived(s.userId, s.bank, true);
    const r = await processDueRules(s.ctx, "2027-02-25");
    expect(r.paused).toHaveLength(1);
    expect((await db.recurringRule.findUniqueOrThrow({ where: { id } })).status).toBe("PAUSED");
  });

  it("deleting a schedule keeps its posted transactions; an account in use can't be deleted", async () => {
    const s = await setup();
    const extra = (await createAccount(s.userId, accountValues({ name: "Spare" }))).id;
    const { id } = await createRecurring(
      s.ctx,
      rule({ type: "TRANSFER", amount: "1000", accountId: s.bank, toAccountId: extra, unit: "WEEKLY", interval: 1, startDate: "2026-11-02" }),
      "2026-11-02",
    );
    await expect(deleteAccount(s.userId, extra)).rejects.toThrow(/has transactions|recurring/);
    await deleteRecurring(s.ctx, id);
    const kept = await db.transaction.findMany({ where: { userId: s.userId, type: "TRANSFER" } });
    expect(kept).toHaveLength(1);
    expect(kept[0].recurringRuleId).toBeNull();
    // Transfers never count as income/expense.
    expect(await s.totals("2026-11-01", "2026-11-30")).toMatchObject({ income: "0.00", expenses: "0.00" });
  });

  it("rejects foreign-currency accounts and other users' accounts", async () => {
    const a = await setup();
    const b = await setup();
    const usd = (await createAccount(a.userId, accountValues({ name: "USD", currency: "USD" }))).id;
    const rent = await a.cat("Rent");
    await expect(
      createRecurring(a.ctx, rule({ type: "EXPENSE", amount: "10", accountId: usd, categoryId: rent, unit: "MONTHLY", interval: 1, startDate: "2026-11-02" }), "2026-11-02"),
    ).rejects.toThrow(/BDT accounts only/);
    await expect(
      createRecurring(b.ctx, rule({ type: "EXPENSE", amount: "10", accountId: a.bank, categoryId: await b.cat("Rent"), unit: "MONTHLY", interval: 1, startDate: "2026-11-02" }), "2026-11-02"),
    ).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("bills", () => {
  it("PRD §9.4: paying creates one expense; paying again is refused; undo restores", async () => {
    const s = await setup();
    const internet = await s.cat("Internet");
    const { id } = await createBill(
      s.ctx,
      bill({ name: "Internet", amount: "1500", categoryId: internet, paymentAccountId: s.bank, unit: "MONTHLY", interval: 1, firstDueDate: "2026-10-28" }),
      "2026-11-02",
    );
    const occ = await db.billOccurrence.findMany({ where: { billId: id }, orderBy: { dueDate: "asc" } });
    expect(occ.map((o) => o.dueDate.toISOString().slice(0, 10))).toEqual(["2026-10-28", "2026-11-28", "2026-12-28", "2027-01-28"]);

    const upcoming = await getUpcomingBills(s.userId, "2026-11-02");
    expect(upcoming.items.map((i) => i.status)).toEqual(["OVERDUE", "UPCOMING"]);
    expect(upcoming.overdueCount).toBe(1);

    // Two concurrent payments of the same occurrence: exactly one expense.
    const results = await Promise.allSettled([
      payBill(s.ctx, { occurrenceId: occ[0].id, date: "2026-11-02", alreadyRecorded: false }),
      payBill(s.ctx, { occurrenceId: occ[0].id, date: "2026-11-02", alreadyRecorded: false }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.transaction.count({ where: { userId: s.userId, source: "BILL" } })).toBe(1);
    await expect(payBill(s.ctx, { occurrenceId: occ[0].id, date: "2026-11-02", alreadyRecorded: false })).rejects.toThrow(/already/);
    expect((await s.totals("2026-11-01", "2026-11-30")).expenses).toBe("1500.00");

    await unpayBill(s.ctx, occ[0].id);
    expect((await s.totals("2026-11-01", "2026-11-30")).expenses).toBe("0.00");
    expect((await db.billOccurrence.findUniqueOrThrow({ where: { id: occ[0].id } })).state).toBe("PENDING");
  });

  it("deleting the bill's expense from Transactions puts the bill back to unpaid; it must stay an expense", async () => {
    const s = await setup();
    const water = await s.cat("Water");
    await createBill(s.ctx, bill({ name: "Water", amount: "600", categoryId: water, paymentAccountId: s.bank, unit: "ONCE", interval: 1, firstDueDate: "2026-11-10" }), "2026-11-02");
    const o = await db.billOccurrence.findFirstOrThrow({ where: { userId: s.userId } });
    const { transactionId } = await payBill(s.ctx, { occurrenceId: o.id, date: "2026-11-09", amount: "650", alreadyRecorded: false });
    expect((await s.balances()).Bank).toBe("99350.00");

    await expect(
      updateTransaction(s.ctx, transactionId!, transactionFormSchema.parse({ type: "TRANSFER", fromAccountId: s.bank, toAccountId: s.savings, amount: "650", date: "2026-11-09" })),
    ).rejects.toThrow(/stay an expense/);
    await deleteTransaction(s.ctx, transactionId!);
    expect((await db.billOccurrence.findUniqueOrThrow({ where: { id: o.id } })).state).toBe("PENDING");
  });

  it("subscriptions: monthly/annual cost; cancelling removes future unpaid occurrences", async () => {
    const s = await setup();
    const ent = await s.cat("Entertainment");
    const { id } = await createBill(
      s.ctx,
      bill({ name: "Streaming", amount: "1200", categoryId: ent, paymentAccountId: s.bank, unit: "YEARLY", interval: 1, firstDueDate: "2026-12-15", isSubscription: true }),
      "2026-11-02",
    );
    await createBill(
      s.ctx,
      bill({ name: "Music", amount: "199", categoryId: ent, paymentAccountId: s.bank, unit: "MONTHLY", interval: 1, firstDueDate: "2026-11-20", isSubscription: true }),
      "2026-11-02",
    );
    const summary = subscriptionSummary(await getBills(s.userId, "2026-11-02"), "BDT");
    expect(summary).toMatchObject({ count: 2, monthly: "299.00", annual: "3588.00" });

    await setBillStatus(s.ctx, id, "CANCELLED", "2026-11-02");
    expect(await db.billOccurrence.count({ where: { billId: id } })).toBe(0);
    await ensureOccurrences(s.userId, "2026-11-02");
    expect(await db.billOccurrence.count({ where: { billId: id } })).toBe(0);
  });

  it("isolates bills between users", async () => {
    const a = await setup();
    const b = await setup();
    await createBill(a.ctx, bill({ name: "Gas", amount: "900", categoryId: await a.cat("Gas"), paymentAccountId: a.bank, unit: "MONTHLY", interval: 1, firstDueDate: "2026-11-10" }), "2026-11-02");
    const o = await db.billOccurrence.findFirstOrThrow({ where: { userId: a.userId } });
    await expect(payBill(b.ctx, { occurrenceId: o.id, date: "2026-11-02", alreadyRecorded: false })).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      createBill(b.ctx, bill({ name: "x", amount: "1", categoryId: await b.cat("Gas"), paymentAccountId: a.bank, unit: "ONCE", interval: 1, firstDueDate: "2026-11-10" }), "2026-11-02"),
    ).rejects.toBeInstanceOf(UserFacingError);
    expect(await getBills(b.userId, "2026-11-02")).toEqual([]);
  });
});

describe("cross-module", () => {
  it("a normal expense still works alongside everything", async () => {
    const s = await setup();
    await createTransaction(s.ctx, transactionFormSchema.parse({ type: "EXPENSE", accountId: s.bank, categoryId: await s.cat("Coffee"), amount: "250", date: "2026-11-02" }));
    expect((await s.balances()).Bank).toBe("99750.00");
  });
});
