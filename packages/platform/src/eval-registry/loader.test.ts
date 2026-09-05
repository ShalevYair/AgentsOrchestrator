import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";
import { listEvalCaseIds, loadEvalCase } from "./loader.js";

let dir: string;
let casesDir: string;

function minimalCase(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    description: "מקרה לבדיקה",
    tags: ["small"],
    recipeName: "repo-analysis",
    userRequest: "נתח את המאגר",
    budgetTotal: 1_000_000,
    budgetLevel: "standard",
    understanding: {
      intent: "analyze",
      deliverableShape: { kind: "markdown", estimatedSize: "medium", structure: "sectioned" },
      evidenceNeeds: [],
      acceptanceCriteria: ["ok"],
      ambiguities: [],
      riskFlags: [],
    },
    assertions: {},
    ...overrides,
  };
}

function writeCase(id: string, overrides: Record<string, unknown> = {}): void {
  writeFileSync(join(casesDir, `${id}.yaml`), stringifyYaml(minimalCase(id, overrides)));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-eval-registry-test-"));
  casesDir = join(dir, "cases");
  mkdirSync(casesDir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("listEvalCaseIds", () => {
  it("throws NotFoundError when <evalsDir>/cases itself is missing", () => {
    expect(() => listEvalCaseIds(join(dir, "does-not-exist"))).toThrow(/eval cases directory not found/);
  });

  it("returns an empty list for an existing but empty cases directory", () => {
    expect(listEvalCaseIds(dir)).toEqual([]);
  });

  it("finds every *.yaml file, sorted, and ignores non-yaml entries", () => {
    writeCase("repo-analysis-small-he");
    writeCase("code-review-en");
    mkdirSync(join(casesDir, "not-a-case"));
    writeFileSync(join(casesDir, "notes.txt"), "not a case");

    expect(listEvalCaseIds(dir)).toEqual(["code-review-en", "repo-analysis-small-he"]);
  });

  it("picks up a brand-new file with zero code changes — just another call", () => {
    writeCase("case-a");
    expect(listEvalCaseIds(dir)).toEqual(["case-a"]);
    writeCase("case-b");
    expect(listEvalCaseIds(dir)).toEqual(["case-a", "case-b"]);
  });
});

describe("loadEvalCase", () => {
  it("throws NotFoundError for an unregistered id", () => {
    expect(() => loadEvalCase(dir, "ghost")).toThrow(/unknown eval case "ghost"/);
  });

  it("throws ConfigError when the file is not valid YAML", () => {
    writeFileSync(join(casesDir, "broken.yaml"), "key: [unclosed");
    expect(() => loadEvalCase(dir, "broken")).toThrow(/not valid YAML/);
  });

  it("throws ConfigError when the parsed content fails EvalCaseSchema", () => {
    writeFileSync(join(casesDir, "invalid.yaml"), stringifyYaml({ id: "invalid" }));
    expect(() => loadEvalCase(dir, "invalid")).toThrow(/does not match EvalCaseSchema/);
  });

  it("throws ConfigError when the id field doesn't match the filename", () => {
    writeCase("case-a", { id: "something-else" });
    expect(() => loadEvalCase(dir, "case-a")).toThrow(/does not match its filename/);
  });

  it("returns a fully parsed, validated EvalCase for a real file", () => {
    writeCase("case-a", { description: "תיאור אמיתי" });
    const evalCase = loadEvalCase(dir, "case-a");
    expect(evalCase.id).toBe("case-a");
    expect(evalCase.description).toBe("תיאור אמיתי");
    expect(evalCase.recipeName).toBe("repo-analysis");
  });

  it("hot-reloads — editing the file on disk takes effect on the very next load, no restart (same design as P10-T2)", () => {
    writeCase("case-a", { description: "גרסה 1" });
    expect(loadEvalCase(dir, "case-a").description).toBe("גרסה 1");

    writeCase("case-a", { description: "גרסה 2" });
    expect(loadEvalCase(dir, "case-a").description).toBe("גרסה 2");
  });
});
