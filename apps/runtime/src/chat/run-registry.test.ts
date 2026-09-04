import { describe, expect, it } from "vitest";
import { RunRegistry } from "./run-registry.js";

describe("RunRegistry", () => {
  it("register returns a controller whose signal is not aborted yet", () => {
    const registry = new RunRegistry();
    const controller = registry.register("run_1");
    expect(controller.signal.aborted).toBe(false);
  });

  it("requestStop aborts the registered controller and returns true", () => {
    const registry = new RunRegistry();
    const controller = registry.register("run_1");
    expect(registry.requestStop("run_1")).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });

  it("requestStop returns false for a runId that was never registered", () => {
    const registry = new RunRegistry();
    expect(registry.requestStop("run_never_existed")).toBe(false);
  });

  it("requestStop returns false after unregister — a race with the run finishing naturally is a benign no-op", () => {
    const registry = new RunRegistry();
    registry.register("run_1");
    registry.unregister("run_1");
    expect(registry.requestStop("run_1")).toBe(false);
  });

  it("tracks multiple runs independently — stopping one never touches another", () => {
    const registry = new RunRegistry();
    const a = registry.register("run_a");
    const b = registry.register("run_b");
    registry.requestStop("run_a");
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
  });
});
