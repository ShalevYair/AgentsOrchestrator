import { MockLLMProvider } from "@ao/providers";
import type { TaskUnderstanding } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { buildReconPrompt, runRecon } from "./recon.js";

const understanding: TaskUnderstanding = {
  intent: "analyze",
  deliverableShape: { kind: "markdown", estimatedSize: "large", structure: "sectioned" },
  evidenceNeeds: [{ what: "repo structure", rung: "R1", why: "needed to map boundaries" }],
  acceptanceCriteria: ["covers all core packages"],
  ambiguities: [],
  suggestedRecipe: "repo-analysis",
  riskFlags: [],
};

describe("buildReconPrompt", () => {
  it("includes the user request and inventory but has no way to smuggle in raw content", () => {
    const prompt = buildReconPrompt({ userRequest: "analyze the repo", inventory: "src/ (12 files, TS)" });
    expect(prompt).toContain("analyze the repo");
    expect(prompt).toContain("src/ (12 files, TS)");
  });
});

describe("runRecon", () => {
  it("returns a schema-valid TaskUnderstanding parsed from the provider's response", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(understanding) }] });
    const result = await runRecon({
      ledger,
      provider,
      model: "gemini-flash-lite-latest",
      stageId: "recon",
      request: { userRequest: "analyze the repo", inventory: "src/ (12 files, TS)" },
      worstCase: 5000,
    });
    expect(result).toEqual(understanding);
  });

  it("spends only against the recon bucket, never another one", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(understanding) }] });
    await runRecon({
      ledger,
      provider,
      model: "gemini-flash-lite-latest",
      stageId: "recon",
      request: { userRequest: "x", inventory: "y" },
      worstCase: 5000,
    });
    expect(ledger.bucketSnapshot("recon").spent).toBeGreaterThan(0);
    expect(ledger.bucketSnapshot("execution").spent).toBe(0);
    expect(ledger.bucketSnapshot("planning").spent).toBe(0);
  });

  it("structurally cannot exceed 2% of the budget — the recon bucket itself is capped there", async () => {
    const ledger = new Ledger({ total: 1_000_000 }); // recon bucket = 20,000 (2%)
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(understanding) }] });
    await expect(
      runRecon({
        ledger,
        provider,
        model: "gemini-flash-lite-latest",
        stageId: "recon",
        request: { userRequest: "x", inventory: "y" },
        worstCase: 25_000, // exceeds the 20,000-token recon bucket
      }),
    ).rejects.toThrow();
    expect(provider.calls.generate).toHaveLength(0); // rejected before ever reaching the provider
  });

  it("throws a clear error instead of returning garbage when the response isn't valid JSON", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: "not json at all" }] });
    await expect(
      runRecon({
        ledger,
        provider,
        model: "gemini-flash-lite-latest",
        stageId: "recon",
        request: { userRequest: "x", inventory: "y" },
        worstCase: 5000,
      }),
    ).rejects.toThrow(/not valid JSON/);
    expect(ledger.openReservationCount).toBe(0); // released, not leaked
  });

  it("throws when the JSON is well-formed but doesn't match TaskUnderstandingSchema", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({
      responses: [{ text: JSON.stringify({ intent: "unknown-intent" }) }],
    });
    await expect(
      runRecon({
        ledger,
        provider,
        model: "gemini-flash-lite-latest",
        stageId: "recon",
        request: { userRequest: "x", inventory: "y" },
        worstCase: 5000,
      }),
    ).rejects.toThrow(/TaskUnderstandingSchema/);
    expect(ledger.openReservationCount).toBe(0);
  });
});
