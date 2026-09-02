import type { Stage } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { topologicalStageOrder } from "./topo.js";

function stage(id: string, dependsOn: string[] = []): Stage {
  return {
    id,
    name: id,
    goal: id,
    dependsOn,
    agentType: "reader",
    fanout: { mode: "single", count: 1, maxParallel: 1 },
    inputs: [],
    outputContract: { schemaRef: "FindingList", format: "ndjson", maxOutputTokens: 8000 },
    contextBudget: { maxInputTokens: 1000, cacheContract: false },
    tokenBudget: { estimatedIn: 100, estimatedOut: 100, hardCap: 1000 },
    mergeStrategy: "local:dedupe-findings",
    successCriteria: [],
    onFailure: "degrade",
    optional: false,
  };
}

describe("topologicalStageOrder", () => {
  it("orders a simple linear chain", () => {
    const stages = [stage("s3", ["s2"]), stage("s1"), stage("s2", ["s1"])];
    expect(topologicalStageOrder(stages)).toEqual(["s1", "s2", "s3"]);
  });

  it("orders a diamond dependency correctly", () => {
    const stages = [stage("s1"), stage("s2", ["s1"]), stage("s3", ["s1"]), stage("s4", ["s2", "s3"])];
    const order = topologicalStageOrder(stages);
    expect(order.indexOf("s1")).toBeLessThan(order.indexOf("s2"));
    expect(order.indexOf("s1")).toBeLessThan(order.indexOf("s3"));
    expect(order.indexOf("s2")).toBeLessThan(order.indexOf("s4"));
    expect(order.indexOf("s3")).toBeLessThan(order.indexOf("s4"));
  });

  it("breaks ties among simultaneously-ready stages deterministically by id", () => {
    const stages = [stage("b"), stage("a"), stage("c")];
    expect(topologicalStageOrder(stages)).toEqual(["a", "b", "c"]);
  });

  it("returns every stage exactly once", () => {
    const stages = [stage("s1"), stage("s2", ["s1"]), stage("s3", ["s1"])];
    const order = topologicalStageOrder(stages);
    expect(order).toHaveLength(3);
    expect(new Set(order).size).toBe(3);
  });
});
