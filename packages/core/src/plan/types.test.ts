import { describe, expect, it } from "vitest";
import { GoalConfigSchema } from "@ao/shared";
import {
  BUDGET_LEVEL_MAX_PARALLEL,
  BUDGET_LEVEL_MAX_RUNG,
  BUDGET_LEVEL_TOKENS,
  DEFAULT_GOAL_CONFIG,
} from "./types.js";

describe("DEFAULT_GOAL_CONFIG", () => {
  it("is a valid GoalConfig (round-trips through the shared schema)", () => {
    expect(GoalConfigSchema.parse(DEFAULT_GOAL_CONFIG)).toEqual(DEFAULT_GOAL_CONFIG);
  });

  it("matches BUDGET.md §1's 'standard' level exactly, by construction", () => {
    expect(DEFAULT_GOAL_CONFIG.level).toBe("standard");
    expect(DEFAULT_GOAL_CONFIG.budgetTotal).toBe(BUDGET_LEVEL_TOKENS.standard);
    expect(DEFAULT_GOAL_CONFIG.maxParallel).toBe(BUDGET_LEVEL_MAX_PARALLEL.standard);
  });

  it("matches UX.md §3's mockup defaults for the non-derived fields", () => {
    expect(DEFAULT_GOAL_CONFIG.effort).toBe("medium");
    expect(DEFAULT_GOAL_CONFIG.overrunPolicy).toBe("degrade");
    expect(DEFAULT_GOAL_CONFIG.allowScripts).toBe(true);
    expect(DEFAULT_GOAL_CONFIG.allowFolderWrite).toBe(false);
    expect(DEFAULT_GOAL_CONFIG.requirePlanApproval).toBe(false);
  });
});

describe("BUDGET_LEVEL_TOKENS", () => {
  it("only 'custom' is undefined", () => {
    expect(BUDGET_LEVEL_TOKENS.draft).toBe(500_000);
    expect(BUDGET_LEVEL_TOKENS.standard).toBe(2_500_000);
    expect(BUDGET_LEVEL_TOKENS.deep).toBe(5_000_000);
    expect(BUDGET_LEVEL_TOKENS.custom).toBeUndefined();
  });

  it("is strictly increasing draft < standard < deep", () => {
    expect(BUDGET_LEVEL_TOKENS.draft).toBeLessThan(BUDGET_LEVEL_TOKENS.standard);
    expect(BUDGET_LEVEL_TOKENS.standard).toBeLessThan(BUDGET_LEVEL_TOKENS.deep);
  });
});

describe("BUDGET_LEVEL_MAX_RUNG (regression: dynamic indexing still widens correctly)", () => {
  it("indexes every BudgetLevel without a compile-time or runtime gap", () => {
    for (const level of ["draft", "standard", "deep", "custom"] as const) {
      expect(BUDGET_LEVEL_MAX_RUNG[level]).toBeDefined();
    }
  });
});
