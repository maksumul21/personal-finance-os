import { describe, expect, it } from "vitest";
import { categoryBreakdown, pctChange, toCsv, type CategoryInfo } from "@/domain/reports";

const cat = (id: string, name: string, parentId: string | null = null): CategoryInfo => ({ id, name, parentId, color: "#000000", icon: "tag" });
const categories = [cat("food", "Food"), cat("groc", "Groceries", "food"), cat("rest", "Restaurants", "food"), cat("rent", "Rent"), cat("fun", "Fun")];

describe("category breakdown", () => {
  it("rolls subcategories into groups with share and change; children add up", () => {
    const b = categoryBreakdown(
      categories,
      [
        { categoryId: "groc", amount: "6000" },
        { categoryId: "rest", amount: "2000" },
        { categoryId: "food", amount: "500" }, // spent on the group itself
        { categoryId: "rent", amount: "20000" },
      ],
      [
        { categoryId: "groc", amount: "4000" },
        { categoryId: "rent", amount: "20000" },
        { categoryId: "fun", amount: "1000" }, // only last period
      ],
    );
    expect(b.map((g) => `${g.name} ${g.amount.toString()}`)).toEqual(["Rent 20000", "Food 8500", "Fun 0"]);
    const food = b[1];
    expect(food.children.map((c) => `${c.name} ${c.amount.toString()}`)).toEqual(["Groceries 6000", "Restaurants 2000", "Food (general) 500"]);
    expect(food.previous.toString()).toBe("4000");
    expect(food.changePct!.toFixed(1)).toBe("112.5");
    expect(food.sharePct!.toFixed(1)).toBe("29.8"); // 8,500 / 28,500
    expect(b[0].children).toEqual([]); // a group with only its own spending has no drill-down
    expect(b[0].changePct!.isZero()).toBe(true);
    expect(b[2].changePct!.toString()).toBe("-100");
  });

  it("change is null without a positive baseline", () => {
    expect(pctChange("100", "0")).toBeNull();
    expect(pctChange("50", "100")!.toString()).toBe("-50");
  });
});

describe("CSV", () => {
  it("quotes, escapes and neutralises formula injection but keeps numbers", () => {
    const csv = toCsv([
      ["Category", "Amount"],
      ['Rent, "flat"', "20000.00"],
      ["=HYPERLINK(\"http://x\")", "-150.00"],
      ["+cmd", null],
      ["@SUM(A1)", 3],
    ]);
    expect(csv).toBe(
      'Category,Amount\r\n"Rent, ""flat""",20000.00\r\n"\'=HYPERLINK(""http://x"")",-150.00\r\n\'+cmd,\r\n\'@SUM(A1),3\r\n',
    );
  });
});
