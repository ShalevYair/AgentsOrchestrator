import { MockLLMProvider } from "@ao/providers";
import type { CheckpointDecision } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { buildCheckpointPrompt, runCheckpoint } from "./agent.js";

const continueDecision: CheckpointDecision = {
  decision: "continue",
  reason: "everything is on track",
  patch: [],
  confidence: 0.9,
};

describe("buildCheckpointPrompt", () => {
  it("includes the summary text", () => {
    const prompt = buildCheckpointPrompt("stage: s1\nsignals fired: none");
    expect(prompt).toContain("stage: s1");
    expect(prompt).toContain("signals fired: none");
  });
});

describe("runCheckpoint", () => {
  it("returns a schema-valid CheckpointDecision parsed from the provider's response", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(continueDecision) }] });
    const result = await runCheckpoint({
      ledger,
      provider,
      model: "gemini-flash-lite-latest",
      stageId: "s1",
      summary: "stage: s1\nsignals fired: none",
      worstCase: 2000,
    });
    expect(result).toEqual(continueDecision);
  });

  it("spends only against the checkpoints bucket", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(continueDecision) }] });
    await runCheckpoint({
      ledger,
      provider,
      model: "gemini-flash-lite-latest",
      stageId: "s1",
      summary: "state",
      worstCase: 2000,
    });
    expect(ledger.bucketSnapshot("checkpoints").spent).toBeGreaterThan(0);
    expect(ledger.bucketSnapshot("execution").spent).toBe(0);
  });

  it("structurally cannot exceed 4% of the budget — the checkpoints bucket itself is capped there", async () => {
    const ledger = new Ledger({ total: 1_000_000 }); // checkpoints bucket = 40,000 (4%)
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(continueDecision) }] });
    await expect(
      runCheckpoint({
        ledger,
        provider,
        model: "gemini-flash-lite-latest",
        stageId: "s1",
        summary: "state",
        worstCase: 45_000,
      }),
    ).rejects.toThrow();
    expect(provider.calls.generate).toHaveLength(0);
  });

  it("throws a clear error when the response isn't valid JSON, without leaking a reservation", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: "not json" }] });
    await expect(
      runCheckpoint({
        ledger,
        provider,
        model: "gemini-flash-lite-latest",
        stageId: "s1",
        summary: "state",
        worstCase: 2000,
      }),
    ).rejects.toThrow(/not valid JSON/);
    expect(ledger.openReservationCount).toBe(0);
  });

  it("throws when JSON doesn't match CheckpointDecisionSchema", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify({ decision: "bogus" }) }] });
    await expect(
      runCheckpoint({
        ledger,
        provider,
        model: "gemini-flash-lite-latest",
        stageId: "s1",
        summary: "state",
        worstCase: 2000,
      }),
    ).rejects.toThrow(/CheckpointDecisionSchema/);
  });
});
