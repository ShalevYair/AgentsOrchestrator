import { MockLLMProvider } from "@ao/providers";
import type { CheckpointDecision } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { runCheckpointGate, type RunCheckpointGateParams } from "./gate.js";
import { NO_SIGNALS } from "./signals.js";

const amendDecision: CheckpointDecision = {
  decision: "amend",
  reason: "modules are larger than expected",
  patch: [{ op: "replace", path: "/stages/0/fanout/count", value: 3 }],
  confidence: 0.8,
};

function baseParams(
  provider: MockLLMProvider,
  overrides: Partial<RunCheckpointGateParams> = {},
): RunCheckpointGateParams {
  return {
    ledger: new Ledger({ total: 1_000_000 }),
    provider,
    model: "gemini-flash-lite-latest",
    stageId: "s1",
    signals: NO_SIGNALS,
    summaryInput: {
      stageId: "s1",
      stageName: "reading",
      budget: { allocated: 1000, spent: 400, committed: 0, available: 600 },
      gaps: [],
      taskOutcomeCounts: { success: 3, failed: 0, budgetRejected: 0, cancelled: 0 },
      successCriteria: [],
      unmetCriteria: [],
    },
    worstCase: 2000,
    ...overrides,
  };
}

describe("runCheckpointGate — P6-T1: no signal, no mandatory point", () => {
  it("never calls the provider — zero tokens spent", async () => {
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(amendDecision) }] });
    const params = baseParams(provider);
    const result = await runCheckpointGate(params);

    expect(result.calledAgent).toBe(false);
    expect(result.triggerReason).toBe("none");
    expect(result.decision.decision).toBe("continue");
    expect(provider.calls.generate).toHaveLength(0);
    expect(params.ledger.spent).toBe(0);
  });
});

describe("runCheckpointGate — a fired signal always calls the agent", () => {
  it("calls the provider exactly once when a signal fires", async () => {
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(amendDecision) }] });
    const params = baseParams(provider, { signals: { ...NO_SIGNALS, budgetDrift: true } });
    const result = await runCheckpointGate(params);

    expect(result.calledAgent).toBe(true);
    expect(result.triggerReason).toBe("signal");
    expect(result.decision).toEqual(amendDecision);
    expect(provider.calls.generate).toHaveLength(1);
  });
});

describe("runCheckpointGate — P6-T5: mandatory points always call the agent", () => {
  it("calls the provider even with every signal false, at a mandatory point", async () => {
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(amendDecision) }] });
    const params = baseParams(provider, { mandatoryPoint: "after-recon" });
    const result = await runCheckpointGate(params);

    expect(result.calledAgent).toBe(true);
    expect(result.triggerReason).toBe("mandatory");
    expect(provider.calls.generate).toHaveLength(1);
  });

  it("covers all three mandatory points from PROTOCOLS.md §6", async () => {
    for (const point of ["after-recon", "after-first-stage", "before-synthesis"] as const) {
      const provider = new MockLLMProvider({
        responses: [
          { text: JSON.stringify({ decision: "continue", reason: "ok", patch: [], confidence: 1 }) },
        ],
      });
      const result = await runCheckpointGate(baseParams(provider, { mandatoryPoint: point }));
      expect(result.calledAgent).toBe(true);
      expect(provider.calls.generate).toHaveLength(1);
    }
  });
});

describe("runCheckpointGate — the summary reaches the prompt", () => {
  it("includes the stage id in the generated prompt", async () => {
    const provider = new MockLLMProvider({
      responses: [{ text: JSON.stringify({ decision: "continue", reason: "ok", patch: [], confidence: 1 }) }],
    });
    await runCheckpointGate(baseParams(provider, { mandatoryPoint: "before-synthesis" }));
    const [call] = provider.calls.generate;
    const promptText = call?.contents.map((m) => m.parts.map((p) => p.text).join("")).join("\n") ?? "";
    expect(promptText).toContain("s1");
  });
});
