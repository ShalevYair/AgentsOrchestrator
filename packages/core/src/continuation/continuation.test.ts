import { MockLLMProvider } from "@ao/providers";
import type { GenerateRequest } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { parseNdjson } from "../parse/index.js";
import {
  buildContinuationPrompt,
  hasProgressed,
  needsContinuation,
  runWithContinuation,
} from "./continuation.js";

function line(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

const baseRequest: GenerateRequest = {
  model: "gemini-3.7-flash",
  contents: [{ role: "user", parts: [{ text: "write sections" }] }],
};

describe("needsContinuation", () => {
  it("is true only when unfinished AND cut off by max_tokens", () => {
    const truncated = parseNdjson(line({ t: "section", id: "s1", title: "a", body: "b" }));
    expect(needsContinuation(truncated, "max_tokens")).toBe(true);
    expect(needsContinuation(truncated, "safety")).toBe(false);
  });

  it("is false once the stream reports done", () => {
    const done = parseNdjson(
      line({ t: "done", summary: "x", selfCheck: { criteriaMet: [], unmet: [], confidence: 1 } }),
    );
    expect(needsContinuation(done, "max_tokens")).toBe(false);
  });
});

describe("hasProgressed", () => {
  it("is false when the last complete envelope hasn't changed", () => {
    const a = parseNdjson(line({ t: "note", text: "x" }));
    const b = parseNdjson(line({ t: "note", text: "x" }) + '{"t":"section","id":"s2","title":"cut');
    expect(hasProgressed(a, b)).toBe(false); // b's trailing line is truncated and dropped — same anchor as a
  });

  it("is true once a new envelope completes", () => {
    const a = parseNdjson(line({ t: "note", text: "x" }));
    const b = parseNdjson(line({ t: "note", text: "x" }) + line({ t: "note", text: "y" }));
    expect(hasProgressed(a, b)).toBe(true);
  });
});

describe("buildContinuationPrompt", () => {
  it("names the last complete envelope's id when it has one", () => {
    const parsed = parseNdjson(line({ t: "section", id: "sec-7", title: "a", body: "b" }));
    expect(buildContinuationPrompt(parsed)).toContain("sec-7");
  });

  it("falls back to a generic phrase when nothing parsed yet", () => {
    const parsed = parseNdjson("garbage\n");
    expect(buildContinuationPrompt(parsed)).not.toContain("undefined");
  });
});

describe("runWithContinuation", () => {
  it("returns already-complete without any provider calls when the initial response was already done", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider();
    const initialText = line({
      t: "done",
      summary: "x",
      selfCheck: { criteriaMet: [], unmet: [], confidence: 1 },
    });
    const result = await runWithContinuation({
      ledger,
      provider,
      stageId: "s1",
      baseRequest,
      initialText,
      initialFinishReason: "stop",
      worstCasePerContinuation: 1000,
    });
    expect(result.outcome).toBe("already-complete");
    expect(provider.calls.generate).toHaveLength(0);
    expect(ledger.openReservationCount).toBe(0);
  });

  it("completes after one continuation, counting it fully in the Ledger", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider({
      responses: [
        {
          text: line({
            t: "done",
            summary: "finished",
            selfCheck: { criteriaMet: [], unmet: [], confidence: 1 },
          }),
          finishReason: "stop",
        },
      ],
    });
    const initialText = line({ t: "section", id: "sec-1", title: "a", body: "partial" });

    const spentBefore = ledger.spent;
    const result = await runWithContinuation({
      ledger,
      provider,
      stageId: "s1",
      agentType: "writer",
      baseRequest,
      initialText,
      initialFinishReason: "max_tokens",
      worstCasePerContinuation: 5000,
    });

    expect(result.outcome).toBe("completed");
    expect(result.attempts).toHaveLength(1);
    expect(provider.calls.generate).toHaveLength(1);
    expect(result.parsed.done).toBe(true);
    expect(ledger.openReservationCount).toBe(0); // settled, nothing leaked
    expect(ledger.spent).toBeGreaterThan(spentBefore); // the continuation call was actually charged
  });

  it("stops with no-progress when a continuation repeats the same last-complete anchor", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    // Every continuation call returns more truncated junk with no new complete envelope.
    const provider = new MockLLMProvider({
      responses: [{ text: '{"t":"section","id":"sec-2","title":"still cut', finishReason: "max_tokens" }],
    });
    const initialText = line({ t: "section", id: "sec-1", title: "a", body: "b" });

    const result = await runWithContinuation({
      ledger,
      provider,
      stageId: "s1",
      baseRequest,
      initialText,
      initialFinishReason: "max_tokens",
      worstCasePerContinuation: 5000,
    });

    expect(result.outcome).toBe("no-progress");
    expect(result.attempts).toHaveLength(1);
    expect(ledger.openReservationCount).toBe(0);
  });

  it("stops at max-continuations-exceeded after exactly 3 attempts, each one making real progress", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    let call = 0;
    const provider = new MockLLMProvider({
      responses: () => {
        call += 1;
        // Each call adds one NEW complete section but never sends "done" and always gets cut off again.
        return {
          text: line({ t: "section", id: `sec-${String(call + 1)}`, title: "t", body: "b" }),
          finishReason: "max_tokens",
        };
      },
    });
    const initialText = line({ t: "section", id: "sec-1", title: "a", body: "b" });

    const result = await runWithContinuation({
      ledger,
      provider,
      stageId: "s1",
      baseRequest,
      initialText,
      initialFinishReason: "max_tokens",
      worstCasePerContinuation: 5000,
      maxContinuations: 3,
    });

    expect(result.outcome).toBe("max-continuations-exceeded");
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.every((a) => a.progressed)).toBe(true);
    expect(provider.calls.generate).toHaveLength(3);
    expect(ledger.openReservationCount).toBe(0);
  });

  it("releases the reservation and propagates the error when a continuation call fails", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider: Parameters<typeof runWithContinuation>[0]["provider"] = {
      countTokens: () => Promise.resolve(0),
      cacheCreate: () => Promise.reject(new Error("not used")),
      models: () => Promise.resolve([]),
      generate: () => {
        throw new Error("provider exploded");
      },
    };
    const initialText = line({ t: "section", id: "sec-1", title: "a", body: "b" });

    await expect(
      runWithContinuation({
        ledger,
        provider,
        stageId: "s1",
        baseRequest,
        initialText,
        initialFinishReason: "max_tokens",
        worstCasePerContinuation: 5000,
      }),
    ).rejects.toThrow("provider exploded");
    expect(ledger.openReservationCount).toBe(0); // no leaked committed tokens on failure
  });

  it("does not attempt continuation when the initial finishReason isn't max_tokens", async () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const provider = new MockLLMProvider();
    const initialText = line({ t: "section", id: "sec-1", title: "a", body: "b" });
    const result = await runWithContinuation({
      ledger,
      provider,
      stageId: "s1",
      baseRequest,
      initialText,
      initialFinishReason: "safety",
      worstCasePerContinuation: 5000,
    });
    expect(result.outcome).toBe("not-truncated");
    expect(provider.calls.generate).toHaveLength(0);
  });
});
