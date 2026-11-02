import { afterAll, afterEach, describe, expect, it } from "vitest";
import { UserFacingError } from "@/server/action";
import { db } from "@/server/db";
import { getAccountsOverview } from "@/server/queries/accounts.query";
import { getCategoryTree } from "@/server/queries/categories.query";
import {
  createAccount,
  deleteAccount,
  setAccountArchived,
  updateAccount,
} from "@/server/services/accounts.service";
import {
  createCategory,
  deleteCategory,
  setCategoryArchived,
} from "@/server/services/categories.service";
import { provisionUser } from "@/server/services/provisioning.service";
import { updatePreferences } from "@/server/services/settings.service";
import { accountValues, anyCategory, cleanupTestUsers, createTestUser, postTransaction } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

describe("provisioning", () => {
  it("creates settings, the default category tree and a Cash account, idempotently", async () => {
    const userId = await createTestUser();
    await db.$transaction((tx) => provisionUser(tx, { id: userId, email: "ignored@x.test" }));

    const settings = await db.userSettings.findUnique({ where: { userId } });
    expect(settings?.numberFormat).toBe("LAKH");

    const expense = await getCategoryTree(userId, "EXPENSE");
    const income = await getCategoryTree(userId, "INCOME");
    expect(expense.map((g) => g.name)).toEqual(["Housing", "Food", "Transportation", "Personal", "Financial", "Lifestyle"]);
    expect(expense.find((g) => g.name === "Food")?.children.map((c) => c.name)).toContain("Groceries");
    expect(income).toHaveLength(8);

    const accounts = await db.account.findMany({ where: { userId } });
    expect(accounts.map((a) => a.name)).toEqual(["Cash"]);
  });
});

describe("accounts", () => {
  it("derives balances from the ledger: PRD transfer scenario", async () => {
    const userId = await createTestUser();
    const bank = await createAccount(userId, accountValues({ name: "Bank", openingBalance: "50000" }));
    const bkash = await createAccount(userId, accountValues({ name: "bKash", type: "MFS", provider: "BKASH", openingBalance: "10000" }));

    await postTransaction(userId, { type: "TRANSFER", fromAccountId: bank.id, toAccountId: bkash.id, amount: "5000" });

    const o = await getAccountsOverview(userId, "BDT");
    const byName = Object.fromEntries(o.accounts.map((a) => [a.name, a.balance]));
    expect(byName.Bank).toBe("45000.00");
    expect(byName.bKash).toBe("15000.00");
    expect(o.totals.totalBalance).toBe("60000.00"); // Cash 0 + 45,000 + 15,000

    const totals = await db.transaction.groupBy({ by: ["type"], where: { userId }, _sum: { baseAmount: true } });
    expect(totals.filter((t) => t.type !== "TRANSFER")).toHaveLength(0);
  });

  it("stores credit-card debt as a liability and keeps it out of total balance", async () => {
    const userId = await createTestUser();
    await createAccount(userId, accountValues({ name: "Bank", openingBalance: "20000" }));
    const card = await createAccount(userId, accountValues({ name: "Card", type: "CREDIT_CARD", openingBalance: "1500", creditLimit: "50000" }));

    const stored = await db.account.findUniqueOrThrow({ where: { id: card.id } });
    expect(stored.openingBalance.toString()).toBe("-1500");
    expect(stored.includeInSafeToSpend).toBe(false);

    const category = await anyCategory(userId, "EXPENSE");
    await postTransaction(userId, { type: "EXPENSE", accountId: card.id, amount: "3000" }, { categoryId: category.id });

    const o = await getAccountsOverview(userId, "BDT");
    expect(o.totals.totalBalance).toBe("20000.00");
    expect(o.totals.totalLiabilities).toBe("4500.00");
  });

  it("excludes archived accounts from totals and blocks deleting accounts with history", async () => {
    const userId = await createTestUser();
    const a = await createAccount(userId, accountValues({ name: "Old", openingBalance: "999" }));
    const b = await createAccount(userId, accountValues({ name: "Used", openingBalance: "100" }));
    const cat = await anyCategory(userId, "INCOME");
    await postTransaction(userId, { type: "INCOME", accountId: b.id, amount: "50" }, { categoryId: cat.id });

    await setAccountArchived(userId, a.id, true);
    expect((await getAccountsOverview(userId, "BDT")).totals.totalBalance).toBe("150.00");

    await expect(deleteAccount(userId, b.id)).rejects.toBeInstanceOf(UserFacingError);
    await deleteAccount(userId, a.id);
    expect(await db.account.findUnique({ where: { id: a.id } })).toBeNull();
  });

  it("locks currency and asset/liability nature once transactions exist", async () => {
    const userId = await createTestUser();
    const values = accountValues({ name: "Wallet", openingBalance: "10" });
    const acc = await createAccount(userId, values);
    const cat = await anyCategory(userId, "INCOME");
    await postTransaction(userId, { type: "INCOME", accountId: acc.id, amount: "5" }, { categoryId: cat.id });

    await expect(updateAccount(userId, acc.id, { ...values, currency: "USD" })).rejects.toThrow(/Currency/);
    await expect(updateAccount(userId, acc.id, { ...values, type: "CREDIT_CARD" })).rejects.toThrow(/asset and liability/);
    await updateAccount(userId, acc.id, { ...values, name: "Wallet 2", type: "SAVINGS" });
  });

  it("rejects duplicate names per user", async () => {
    const userId = await createTestUser();
    await createAccount(userId, accountValues({ name: "Main" }));
    await expect(createAccount(userId, accountValues({ name: "Main" }))).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("user isolation", () => {
  it("never lets one user read or change another user's accounts or categories", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const acc = await createAccount(alice, accountValues({ name: "Alice Bank", openingBalance: "1000" }));
    const aliceCat = await anyCategory(alice, "EXPENSE");

    const bobView = await getAccountsOverview(bob, "BDT");
    expect(bobView.accounts.some((a) => a.id === acc.id)).toBe(false);

    await expect(updateAccount(bob, acc.id, accountValues({ name: "Hijack" }))).rejects.toBeInstanceOf(UserFacingError);
    await expect(setAccountArchived(bob, acc.id, true)).rejects.toBeInstanceOf(UserFacingError);
    await expect(deleteAccount(bob, acc.id)).rejects.toBeInstanceOf(UserFacingError);
    await expect(setCategoryArchived(bob, aliceCat.id, true)).rejects.toBeInstanceOf(UserFacingError);
    await expect(deleteCategory(bob, aliceCat.id)).rejects.toBeInstanceOf(UserFacingError);
    await expect(
      createCategory(bob, { name: "Sneaky", kind: "EXPENSE", parentId: aliceCat.parentId, icon: "tag", color: "#64748b", isEssential: false }),
    ).rejects.toThrow(/Parent category not found/);

    const untouched = await db.account.findUniqueOrThrow({ where: { id: acc.id } });
    expect(untouched.name).toBe("Alice Bank");
    expect(untouched.isArchived).toBe(false);
  });
});

describe("categories", () => {
  it("limits depth to two levels and archives children with their group", async () => {
    const userId = await createTestUser();
    const group = await createCategory(userId, { name: "Pets", kind: "EXPENSE", parentId: null, icon: "tag", color: "#64748b", isEssential: false });
    const child = await createCategory(userId, { name: "Vet", kind: "EXPENSE", parentId: group.id, icon: "tag", color: "#64748b", isEssential: true });

    await expect(
      createCategory(userId, { name: "Too deep", kind: "EXPENSE", parentId: child.id, icon: "tag", color: "#64748b", isEssential: false }),
    ).rejects.toThrow(/subcategories/);
    await expect(
      createCategory(userId, { name: "Wrong kind", kind: "INCOME", parentId: group.id, icon: "tag", color: "#64748b", isEssential: false }),
    ).rejects.toThrow(/same type/);
    await expect(
      createCategory(userId, { name: "vet", kind: "EXPENSE", parentId: group.id, icon: "tag", color: "#64748b", isEssential: false }),
    ).rejects.toThrow(/already exists/);

    await expect(deleteCategory(userId, group.id)).rejects.toThrow(/subcategories/);
    await setCategoryArchived(userId, group.id, true);
    const archived = await db.category.findMany({ where: { id: { in: [group.id, child.id] } } });
    expect(archived.every((c) => c.isArchived)).toBe(true);
    await expect(setCategoryArchived(userId, child.id, false)).rejects.toThrow(/Restore/);
  });
});

describe("database constraints", () => {
  it("rejects a transfer with a category, a non-positive amount, and an income without a category", async () => {
    const userId = await createTestUser();
    const cat = await anyCategory(userId, "EXPENSE");
    const base = { userId, date: new Date("2026-11-01T00:00:00Z"), currency: "BDT", baseAmount: "10" };
    await expect(db.transaction.create({ data: { ...base, type: "TRANSFER", amount: "10", categoryId: cat.id } })).rejects.toThrow();
    await expect(db.transaction.create({ data: { ...base, type: "EXPENSE", amount: "0", categoryId: cat.id } })).rejects.toThrow();
    await expect(db.transaction.create({ data: { ...base, type: "INCOME", amount: "10" } })).rejects.toThrow();
  });
});

describe("settings", () => {
  it("locks base currency once transactions exist and validates thresholds in the DB", async () => {
    const userId = await createTestUser();
    const prefs = {
      baseCurrency: "USD" as const,
      timezone: "Asia/Dhaka",
      dateFormat: "dd MMM yyyy" as const,
      numberFormat: "INTL" as const,
      weekStartsOn: 0,
      dashboardPeriod: "THIS_MONTH" as const,
      budgetWarnPct: 60,
      budgetCriticalPct: 85,
    };
    await updatePreferences(userId, prefs);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).baseCurrency).toBe("USD");

    const acc = await createAccount(userId, accountValues({ name: "A", currency: "USD" }));
    const cat = await anyCategory(userId, "INCOME");
    await postTransaction(userId, { type: "INCOME", accountId: acc.id, amount: "1" }, { categoryId: cat.id });
    await expect(updatePreferences(userId, { ...prefs, baseCurrency: "BDT" })).rejects.toThrow(/Base currency/);

    await expect(db.userSettings.update({ where: { userId }, data: { budgetWarnPct: 95, budgetCriticalPct: 90 } })).rejects.toThrow();
  });
});
