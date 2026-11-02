import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin relative paths with their query and hash", () => {
    expect(safeRedirectPath("/transactions?type=EXPENSE#top")).toBe("/transactions?type=EXPENSE#top");
    expect(safeRedirectPath("/budgets/123")).toBe("/budgets/123");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "/\t/evil.com",
      "https://evil.com",
      "evil.com",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(safeRedirectPath(bad)).toBe("/dashboard");
    }
  });
});
