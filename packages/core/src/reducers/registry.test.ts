import type { Finding } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { createReducerRegistry } from "./registry.js";
import type { ReduceContext, ReduceOutcome, Reducer, TaskResult } from "./types.js";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    stageId: "s1",
    claim: "a claim",
    tags: [],
    evidence: [{ artifact: "a1", loc: "src/x.ts:1-2" }],
    confidence: 0.7,
    ...overrides,
  };
}

const CONTEXT: ReduceContext = { stageId: "s1" };

describe("createReducerRegistry — built-ins", () => {
  it("pre-registers every LOCAL_REDUCERS entry", () => {
    const registry = createReducerRegistry();
    expect(registry.list()).toEqual([
      "local:assemble-files",
      "local:concat-ordered",
      "local:dedupe-findings",
      "local:vote",
    ]);
  });

  it("resolves a built-in reducer that actually runs correctly", () => {
    const registry = createReducerRegistry();
    const dedupe = registry.resolve<Finding[], Finding[]>("local:dedupe-findings");
    const inputs: TaskResult<Finding[]>[] = [
      { taskId: "t1", value: [finding({ id: "f1", claim: "same claim" })] },
      { taskId: "t2", value: [finding({ id: "f2", claim: "same claim" })] },
    ];
    const result = dedupe(inputs, CONTEXT);
    expect(result.value).toHaveLength(1);
  });

  it("does not pre-register local:reduce-tree or llm:synthesize — they need a caller-supplied piece this flat registry has no room for", () => {
    const registry = createReducerRegistry();
    expect(registry.has("local:reduce-tree")).toBe(false);
    expect(registry.has("llm:synthesize")).toBe(false);
  });
});

describe("createReducerRegistry — custom registration (P10-T6)", () => {
  it("registers a reducer defined entirely outside packages/core, then resolves and actually runs it", () => {
    const registry = createReducerRegistry();

    // Defined right here, in a test file — nothing under packages/core/src
    // was touched to make this reducer exist or be usable.
    const takeFirst: Reducer<string, string> = (inputs): ReduceOutcome<string> => ({
      value: inputs[0]?.value ?? "",
      gaps: [],
      needsLlmStitch: false,
    });

    registry.register("custom:take-first", takeFirst);

    expect(registry.has("custom:take-first")).toBe(true);
    expect(registry.list()).toContain("custom:take-first");

    const resolved = registry.resolve<string, string>("custom:take-first");
    const outcome = resolved([{ taskId: "t1", value: "hello" }], CONTEXT);
    expect(outcome.value).toBe("hello");
  });

  it("throws when registering an id that's already taken — built-in or custom", () => {
    const registry = createReducerRegistry();
    const noop: Reducer<unknown, unknown> = (inputs) => ({
      value: inputs[0]?.value,
      gaps: [],
      needsLlmStitch: false,
    });
    expect(() => registry.register("local:concat-ordered", noop)).toThrow(/already registered/);

    registry.register("custom:once", noop);
    expect(() => registry.register("custom:once", noop)).toThrow(/already registered/);
  });

  it("throws a clear, discoverable error — naming every known id — when resolving an unregistered id", () => {
    const registry = createReducerRegistry();
    expect(() => registry.resolve("custom:never-registered")).toThrow(
      /no reducer registered for mergeStrategy "custom:never-registered" — known:/,
    );
  });

  it("two independently created registries don't share state", () => {
    const a = createReducerRegistry();
    const b = createReducerRegistry();
    a.register("custom:only-in-a", (inputs) => ({
      value: inputs[0]?.value,
      gaps: [],
      needsLlmStitch: false,
    }));
    expect(a.has("custom:only-in-a")).toBe(true);
    expect(b.has("custom:only-in-a")).toBe(false);
  });
});
