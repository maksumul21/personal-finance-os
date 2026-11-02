import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createManualItemSchema, valuationSchema } from "@/features/net-worth/schemas";
import { db } from "@/server/db";
import { getDashboard } from "@/server/queries/dashboard.query";
import { getNetWorth } from "@/server/queries/net-worth.query";
import { createAccount } from "@/server/services/accounts.service";
import {
  createManualItem,
  deleteManualItem,
  deleteValuation,
  recordValuation,
  setManualItemArchived,
  updateManualItem,
} from "@/server/services/net-worth.service";
import { accountValues, cleanupTestUsers, createTestUser } from "./helpers";

afterEach(cleanupTestUsers);
afterAll(() => db.$disconnect());

async function setup() {
  const userId = await createTestUser();
  await createAccount(userId, accountValues({ name: "Bank", openingBalance: "100000", openingDate: "2026-01-01" }));
  await createAccount(userId, accountValues({ name: "Card", type: "CREDIT_CARD", openingBalance: "20000", openingDate: "2026-01-01" }));
  const flat = await createManualItem(
    userId,
    createManualItemSchema.parse({ item: { name: "Flat", kind: "ASSET", category: "PROPERTY", currency: "BDT" }, value: "2500000", date: "2026-06-30" }),
  );
  const loan = await createManualItem(
    userId,
    createManualItemSchema.parse({ item: { name: "From uncle", kind: "LIABILITY", category: "PERSONAL_DEBT", currency: "BDT" }, value: "100000", date: "2026-09-15" }),
  );
  return { userId, flat: flat.id, loan: loan.id };
}

describe("net worth (D-030: accounts + manual assets − manual liabilities)", () => {
  it("builds the balance sheet and month-end history from valuations", async () => {
    const s = await setup();
    await recordValuation(s.userId, valuationSchema.parse({ itemId: s.loan, date: "2026-10-20", value: "0", note: "Repaid" }));

    const nw = await getNetWorth(s.userId, "BDT", "2026-11-02");
    expect(nw.totalAssets).toBe("2600000.00"); // bank 1,00,000 + flat 25,00,000
    expect(nw.totalLiabilities).toBe("20000.00"); // card
    expect(nw.netWorth).toBe("2580000.00");
    expect(Object.fromEntries(nw.groups.map((g) => [g.key, g.amount]))).toMatchObject({
      cash: "100000.00",
      "manual-assets": "2500000.00",
      cards: "20000.00",
      "manual-liabilities": "0.00",
    });

    const at = (m: string) => nw.history.find((h) => h.month === m)?.netWorth;
    expect(at("2026-05")).toBe("80000.00"); // before the flat was valued
    expect(at("2026-06")).toBe("2580000.00");
    expect(at("2026-09")).toBe("2480000.00"); // the family loan was owed
    expect(at("2026-10")).toBe("2580000.00"); // repaid
    expect(nw.change.monthAmount).toBe("0.00");
    expect(nw.history).toHaveLength(12);

    const dash = await getDashboard({
      userId: s.userId,
      baseCurrency: "BDT",
      today: "2026-11-02",
      period: { start: "2026-11-01", end: "2026-11-30" },
      trendMonths: 3,
      thresholds: { warnPct: 70, criticalPct: 90 },
      pref: "LAKH",
    });
    expect(dash.kpis.netWorth).toBe("2580000.00");
    expect(dash.months.find((m) => m.month === "2026-09")?.netWorth).toBe("2480000.00");
  });

  it("archived items drop out; kind and currency are fixed; the last value can't be deleted", async () => {
    const s = await setup();
    await setManualItemArchived(s.userId, s.flat, true);
    expect((await getNetWorth(s.userId, "BDT", "2026-11-02")).netWorth).toBe("-20000.00");

    await expect(updateManualItem(s.userId, s.flat, { name: "Flat", kind: "LIABILITY", category: "OTHER", currency: "BDT", notes: "" })).rejects.toThrow(/liability/);
    await expect(updateManualItem(s.userId, s.flat, { name: "Flat", kind: "ASSET", category: "PROPERTY", currency: "USD", notes: "" })).rejects.toThrow(/Currency/);
    const only = await db.manualValuation.findFirstOrThrow({ where: { itemId: s.flat } });
    await expect(deleteValuation(s.userId, only.id)).rejects.toThrow(/only value/);
  });

  it("isolates manual items between users", async () => {
    const a = await setup();
    const b = await setup();
    await expect(recordValuation(b.userId, valuationSchema.parse({ itemId: a.flat, date: "2026-11-01", value: "1" }))).rejects.toThrow(/not found/);
    await expect(deleteManualItem(b.userId, a.flat)).rejects.toThrow(/not found/);
    expect((await getNetWorth(b.userId, "BDT", "2026-11-02")).items.map((i) => i.id).sort()).toEqual([b.flat, b.loan].sort());
  });
});
