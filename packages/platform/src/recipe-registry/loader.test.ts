import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import { listRecipeNames, loadRecipe } from "./loader.js";

let dir: string;

function minimalRecipe(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    displayName: name,
    description: "מתכון לבדיקה",
    objectiveTemplate: "{{userRequest}}",
    readPolicy: { maxRung: "R2", fullReadAllowlist: [], summarizeIf: { minRelevance: 0.5, maxFiles: 20 } },
    deliverables: [{ id: "d1", kind: "markdown", target: "chat", acceptance: ["ok"] }],
    stages: [
      {
        id: "s1",
        name: "שלב",
        goal: "מטרה",
        dependsOn: [],
        agentType: "reader",
        fanout: { mode: "single", count: 1, maxParallel: 1 },
        inputs: [{ from: "artifacts", select: "all" }],
        outputContract: { schemaRef: "NdjsonEnvelope", format: "ndjson", maxOutputTokens: 8000 },
        contextBudget: { maxInputTokens: 20_000, cacheContract: false },
        tokenBudgetShare: { estimatedInShare: 0.1, estimatedOutShare: 0.1, hardCapShare: 0.3 },
        mergeStrategy: "local:concat-ordered",
        successCriteria: ["ok"],
        onFailure: "retry",
        optional: false,
      },
    ],
    reserveShare: { synthesisTokensShare: 0.05, repairTokensShare: 0.05 },
    ...overrides,
  };
}

function writeRecipe(name: string, overrides: Record<string, unknown> = {}): void {
  writeFileSync(join(dir, `${name}.yaml`), stringifyYaml(minimalRecipe(name, overrides)));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-recipe-registry-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("listRecipeNames", () => {
  it("throws NotFoundError when the recipes directory itself is missing", () => {
    expect(() => listRecipeNames(join(dir, "does-not-exist"))).toThrow(/recipes directory not found/);
  });

  it("returns an empty list for an existing but empty directory", () => {
    expect(listRecipeNames(dir)).toEqual([]);
  });

  it("finds every *.yaml file, sorted, and ignores non-yaml entries", () => {
    writeRecipe("repo-analysis");
    writeRecipe("code-review");
    mkdirSync(join(dir, "not-a-recipe"));
    writeFileSync(join(dir, "notes.txt"), "not a recipe");

    expect(listRecipeNames(dir)).toEqual(["code-review", "repo-analysis"]);
  });

  it("picks up a brand-new file with zero code changes — just another call", () => {
    writeRecipe("repo-analysis");
    expect(listRecipeNames(dir)).toEqual(["repo-analysis"]);
    writeRecipe("migration");
    expect(listRecipeNames(dir)).toEqual(["migration", "repo-analysis"]);
  });
});

describe("loadRecipe", () => {
  it("throws NotFoundError for an unregistered name", () => {
    expect(() => loadRecipe(dir, "ghost")).toThrow(/unknown recipe "ghost"/);
  });

  it("throws ConfigError when the file is not valid YAML", () => {
    writeFileSync(join(dir, "broken.yaml"), "key: [unclosed");
    expect(() => loadRecipe(dir, "broken")).toThrow(/not valid YAML/);
  });

  it("throws ConfigError when the parsed content fails RecipeSchema", () => {
    writeFileSync(join(dir, "invalid.yaml"), stringifyYaml({ name: "invalid" }));
    expect(() => loadRecipe(dir, "invalid")).toThrow(/does not match RecipeSchema/);
  });

  it("throws ConfigError when the name field doesn't match the filename", () => {
    writeRecipe("repo-analysis", { name: "something-else" });
    expect(() => loadRecipe(dir, "repo-analysis")).toThrow(/does not match its filename/);
  });

  it("returns a fully parsed, validated Recipe for a real file", () => {
    writeRecipe("repo-analysis", { displayName: "ניתוח מאגר" });
    const recipe = loadRecipe(dir, "repo-analysis");
    expect(recipe.name).toBe("repo-analysis");
    expect(recipe.displayName).toBe("ניתוח מאגר");
    expect(recipe.stages).toHaveLength(1);
  });

  it("hot-reloads — editing the file on disk takes effect on the very next load, no restart (same design as P10-T2)", () => {
    writeRecipe("repo-analysis", { description: "גרסה 1" });
    expect(loadRecipe(dir, "repo-analysis").description).toBe("גרסה 1");

    writeRecipe("repo-analysis", { description: "גרסה 2" });
    expect(loadRecipe(dir, "repo-analysis").description).toBe("גרסה 2");
  });
});
