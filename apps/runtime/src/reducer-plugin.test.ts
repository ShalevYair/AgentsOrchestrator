import { createReducerRegistry, instantiateRecipe, validatePlan, type PlanValidationContext } from "@ao/core";
import { loadRecipe } from "@ao/platform";
import type { ReduceContext, ReduceOutcome, Reducer, TaskResult } from "@ao/core";
import { describe, expect, it } from "vitest";
import { resolveRecipesDir } from "./recipes-dir.js";

const recipesDir = resolveRecipesDir({ moduleUrl: import.meta.url });

/**
 * A reducer that has never existed inside `packages/core` — written right
 * here, in `apps/runtime`, a different package entirely. Picks the longest
 * of several candidate section bodies (a plausible real merge strategy: an
 * `ensemble`-fanned-out stage producing several draft sections, keep the
 * most complete one).
 */
const pickLongest: Reducer<string, string> = (
  inputs: readonly TaskResult<string>[],
): ReduceOutcome<string> => {
  const longest = inputs.reduce(
    (best, current) => (current.value.length > best.length ? current.value : best),
    "",
  );
  return { value: longest, gaps: [], needsLlmStitch: false };
};

describe("reducer plugin (P10-T6) — a custom reducer, defined entirely outside packages/core, registers and runs", () => {
  it("registers under a custom id and actually runs, producing the expected merged value", () => {
    const registry = createReducerRegistry();
    registry.register("custom:pick-longest", pickLongest);

    const resolved = registry.resolve<string, string>("custom:pick-longest");
    const outcome = resolved(
      [
        { taskId: "t1", value: "short" },
        { taskId: "t2", value: "a much longer candidate section body" },
        { taskId: "t3", value: "medium length" },
      ],
      { stageId: "s1" } satisfies ReduceContext,
    );
    expect(outcome.value).toBe("a much longer candidate section body");
  });

  it("a real recipe's Plan can declare the custom mergeStrategy and pass validatePlan's V9 once it's registered — no packages/core edit required", () => {
    const registry = createReducerRegistry();
    registry.register("custom:pick-longest", pickLongest);

    const recipe = loadRecipe(recipesDir, "repo-analysis");
    const plan = instantiateRecipe({
      recipe,
      runId: "run_plugintest",
      userRequest: "בדיקת reducer מותאם",
      budgetTotal: 1_000_000,
    });
    // Repoint one real stage at the plugin reducer instead of its recipe-authored one.
    const writeStage = plan.stages.find((s) => s.id === "write")!;
    writeStage.mergeStrategy = "custom:pick-longest";

    const validationContext: PlanValidationContext = {
      budgetTotal: 1_000_000,
      budgetLevel: "standard",
      knownAgentTypes: new Set(["reader", "analyst", "coder", "writer", "critic", "synthesizer"]),
      modelMaxOutputTokens: 64_000,
      knownReducerIds: new Set(registry.list()),
    };

    const result = validatePlan(plan, validationContext);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("V9 rejects the same plan when the plugin reducer was never registered — proves the check is real, not a rubber stamp", () => {
    const registry = createReducerRegistry(); // no .register() call this time

    const recipe = loadRecipe(recipesDir, "repo-analysis");
    const plan = instantiateRecipe({
      recipe,
      runId: "run_plugintest",
      userRequest: "בדיקת reducer מותאם",
      budgetTotal: 1_000_000,
    });
    plan.stages.find((s) => s.id === "write")!.mergeStrategy = "custom:pick-longest";

    const result = validatePlan(plan, {
      budgetTotal: 1_000_000,
      budgetLevel: "standard",
      knownAgentTypes: new Set(["reader", "analyst", "coder", "writer", "critic", "synthesizer"]),
      modelMaxOutputTokens: 64_000,
      knownReducerIds: new Set(registry.list()),
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "V9" && i.message.includes("custom:pick-longest"))).toBe(
      true,
    );
  });
});
