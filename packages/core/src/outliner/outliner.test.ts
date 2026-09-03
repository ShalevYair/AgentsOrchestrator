import { MockLLMProvider } from "@ao/providers";
import type { OutlineSpec } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { buildOutlinerPrompt, OUTLINER_MAX_OUTPUT_TOKENS, runOutliner } from "./outliner.js";

const SMALL_OUTLINE: OutlineSpec = {
  id: "outline-1",
  sections: [
    {
      id: "sec-1",
      title: "Overview",
      goal: "explain the change",
      deliverableKind: "markdown",
      expectedOutputTokens: 4000,
    },
    {
      id: "sec-2",
      title: "src/index.ts",
      goal: "entry point",
      deliverableKind: "files",
      path: "src/index.ts",
      expectedOutputTokens: 8000,
    },
  ],
};

const CAPS = { writer: 12_000, coder: 16_000 };

describe("buildOutlinerPrompt", () => {
  it("includes the user request and deliverable summary but has no field to smuggle raw content", () => {
    const prompt = buildOutlinerPrompt({
      userRequest: "write a README",
      deliverableSummary: "markdown, sectioned",
    });
    expect(prompt).toContain("write a README");
    expect(prompt).toContain("markdown, sectioned");
  });
});

describe("runOutliner", () => {
  it("returns a validated outline and its real output-token count", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(SMALL_OUTLINE) }] });

    const outcome = await runOutliner({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "stage-1",
      request: { userRequest: "outline a small project", deliverableSummary: "markdown + one file" },
      worstCase: 2000,
      ownerCaps: CAPS,
    });

    expect(outcome.outline).toEqual(SMALL_OUTLINE);
    expect(outcome.outputTokens).toBeGreaterThan(0);
    expect(outcome.outputTokens).toBeLessThan(OUTLINER_MAX_OUTPUT_TOKENS);
  });

  it("spends only against the execution bucket, never another one", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(SMALL_OUTLINE) }] });

    await runOutliner({
      ledger,
      provider,
      model: "gemini-3.7-flash",
      stageId: "stage-1",
      request: { userRequest: "x", deliverableSummary: "y" },
      worstCase: 2000,
      ownerCaps: CAPS,
    });

    expect(ledger.bucketSnapshot("execution").spent).toBeGreaterThan(0);
    expect(ledger.bucketSnapshot("planning").spent).toBe(0);
    expect(ledger.bucketSnapshot("synthesis").spent).toBe(0);
  });

  it("a worstCase exceeding the execution bucket's remaining allocation is rejected before the provider is ever called", async () => {
    const ledger = new Ledger({ total: 1_000 }); // execution bucket = 580 (58%)
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(SMALL_OUTLINE) }] });

    await expect(
      runOutliner({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "stage-1",
        request: { userRequest: "x", deliverableSummary: "y" },
        worstCase: 10_000,
        ownerCaps: CAPS,
      }),
    ).rejects.toThrow(/execution bucket/);
    expect(provider.calls.generate).toHaveLength(0);
  });

  it("rejects (and releases the reservation for) a response whose JSON doesn't match OutlineSpecSchema", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify({ id: "o1" }) }] }); // sections missing

    await expect(
      runOutliner({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "stage-1",
        request: { userRequest: "x", deliverableSummary: "y" },
        worstCase: 2000,
        ownerCaps: CAPS,
      }),
    ).rejects.toThrow(/OutlineSpecSchema/);
    expect(ledger.openReservationCount).toBe(0);
    expect(ledger.bucketSnapshot("execution").spent).toBe(0);
  });

  it("rejects a section whose expectedOutputTokens exceeds its owning agent type's cap", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const oversized: OutlineSpec = {
      id: "outline-2",
      sections: [
        {
          id: "sec-huge",
          title: "everything",
          goal: "one giant section",
          deliverableKind: "markdown",
          expectedOutputTokens: 50_000, // > writer's 12K cap
        },
      ],
    };
    const provider = new MockLLMProvider({ responses: [{ text: JSON.stringify(oversized) }] });

    await expect(
      runOutliner({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "stage-1",
        request: { userRequest: "x", deliverableSummary: "y" },
        worstCase: 2000,
        ownerCaps: CAPS,
      }),
    ).rejects.toThrow(/sec-huge/);
    expect(ledger.openReservationCount).toBe(0);
  });

  it("rejects an outline whose own output exceeds the 4K outliner cap, even though it schema-validates", async () => {
    const ledger = new Ledger({ total: 10_000_000 });
    const manySections: OutlineSpec = {
      id: "outline-3",
      sections: Array.from({ length: 400 }, (_, i) => ({
        id: `sec-${String(i)}`,
        title: `Section ${String(i)} with a long padded title to inflate output size`,
        goal: "padding padding padding padding padding padding padding padding",
        deliverableKind: "markdown" as const,
        expectedOutputTokens: 1000,
      })),
    };
    const text = JSON.stringify(manySections);
    // sanity: this response is deliberately large enough (at 0.3 tokens/char) to exceed the 4K cap.
    expect(text.length * 0.3).toBeGreaterThan(OUTLINER_MAX_OUTPUT_TOKENS);
    const provider = new MockLLMProvider({ responses: [{ text }] });

    await expect(
      runOutliner({
        ledger,
        provider,
        model: "gemini-3.7-flash",
        stageId: "stage-1",
        request: { userRequest: "x", deliverableSummary: "y" },
        worstCase: 200_000,
        ownerCaps: CAPS,
      }),
    ).rejects.toThrow(/4000-token cap/);
    expect(ledger.openReservationCount).toBe(0);
  });
});
