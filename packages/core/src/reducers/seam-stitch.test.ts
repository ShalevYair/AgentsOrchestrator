import { MockLLMProvider } from "@ao/providers";
import { describe, expect, it } from "vitest";
import { Ledger } from "../ledger/index.js";
import { assertBoundedSeamScope, MAX_SEAM_SPAN, runSeamStitch } from "./seam-stitch.js";

describe("assertBoundedSeamScope", () => {
  it("accepts a small, bounded scope", () => {
    expect(() => assertBoundedSeamScope(["sec-1", "sec-2"])).not.toThrow();
  });

  it("rejects an empty scope", () => {
    expect(() => assertBoundedSeamScope([])).toThrow(/at least one section/);
  });

  it("rejects a scope wider than MAX_SEAM_SPAN", () => {
    const wide = Array.from({ length: MAX_SEAM_SPAN + 1 }, (_, i) => `sec-${String(i)}`);
    expect(() => assertBoundedSeamScope(wide)).toThrow(new RegExp(`${String(MAX_SEAM_SPAN)}-section`));
  });

  it("rejects a scope that covers the entire document, even when small enough to otherwise pass", () => {
    expect(() => assertBoundedSeamScope(["sec-1", "sec-2"], 2)).toThrow(/entire document/);
  });

  it("accepts a scope smaller than the total document", () => {
    expect(() => assertBoundedSeamScope(["sec-1"], 5)).not.toThrow();
  });
});

const RESPONSE_JSON = JSON.stringify({
  sections: [
    { id: "sec-1", correctedBody: "fixed sec-1" },
    { id: "sec-2", correctedBody: "fixed sec-2" },
  ],
});

type BaseParams = Omit<Parameters<typeof runSeamStitch>[0], "provider"> & { provider: MockLLMProvider };

function baseParams(overrides: Partial<BaseParams> = {}): BaseParams {
  return {
    ledger: new Ledger({ total: 1_000_000 }),
    provider: new MockLLMProvider({ responses: [{ text: RESPONSE_JSON }] }),
    model: "gemini-3.7-flash",
    stageId: "stage-1",
    violation: { sectionIds: ["sec-1", "sec-2"], detail: "broken cross-reference between sec-1 and sec-2" },
    targets: [
      { id: "sec-1", currentContent: "old sec-1" },
      { id: "sec-2", currentContent: "old sec-2" },
    ],
    worstCase: 2000,
    ...overrides,
  };
}

describe("runSeamStitch", () => {
  it("returns corrected content for exactly the requested seam, drawn and settled from reserve", async () => {
    const params = baseParams();
    const outcome = await runSeamStitch(params);

    expect(outcome.correctedSections).toEqual({ "sec-1": "fixed sec-1", "sec-2": "fixed sec-2" });
    expect(outcome.log.sectionIds).toEqual(["sec-1", "sec-2"]);
    expect(outcome.log.reason).toBe(params.violation.detail);
    expect(outcome.log.tokensSpent).toBeGreaterThan(0);
    expect(outcome.log.clamped).toBe(false);

    // spent from reserve, not from any normal bucket
    expect(params.ledger.reserveSnapshot().spent).toBe(outcome.log.tokensSpent);
    expect(params.ledger.bucketSnapshot("execution").spent).toBe(0);
    expect(params.ledger.bucketSnapshot("synthesis").spent).toBe(0);
    expect(params.ledger.openReservationCount).toBe(0);
  });

  it("rejects (before spending anything) a violation whose scope exceeds MAX_SEAM_SPAN", async () => {
    const params = baseParams({
      violation: {
        sectionIds: Array.from({ length: MAX_SEAM_SPAN + 1 }, (_, i) => `sec-${String(i)}`),
        detail: "too wide",
      },
      targets: Array.from({ length: MAX_SEAM_SPAN + 1 }, (_, i) => ({
        id: `sec-${String(i)}`,
        currentContent: "x",
      })),
    });
    await expect(runSeamStitch(params)).rejects.toThrow(/section.*bound/);
    expect(params.provider.calls.generate).toHaveLength(0);
    expect(params.ledger.reserveSnapshot().spent).toBe(0);
  });

  it("rejects when targets don't cover every id named by the violation", async () => {
    const params = baseParams({ targets: [{ id: "sec-1", currentContent: "old sec-1" }] }); // sec-2 missing
    await expect(runSeamStitch(params)).rejects.toThrow(/sec-2/);
    expect(params.provider.calls.generate).toHaveLength(0);
  });

  it("rejects when targets carry an id outside the violation's own scope", async () => {
    const params = baseParams({
      targets: [
        { id: "sec-1", currentContent: "old sec-1" },
        { id: "sec-2", currentContent: "old sec-2" },
        { id: "sec-99", currentContent: "unrelated" },
      ],
    });
    await expect(runSeamStitch(params)).rejects.toThrow(/exactly/);
    expect(params.provider.calls.generate).toHaveLength(0);
  });

  it("rejects (and releases the reservation for) a response that touches a section outside the requested scope", async () => {
    const outOfScope = JSON.stringify({
      sections: [
        { id: "sec-1", correctedBody: "fixed sec-1" },
        { id: "sec-99", correctedBody: "should never be here" },
      ],
    });
    const params = baseParams({ provider: new MockLLMProvider({ responses: [{ text: outOfScope }] }) });

    await expect(runSeamStitch(params)).rejects.toThrow(/sec-99/);
    expect(params.ledger.openReservationCount).toBe(0);
    expect(params.ledger.reserveSnapshot().spent).toBe(0); // released, not settled
  });

  it("surfaces reservation.clamped when the reserve pool can't grant the full worstCase (level 8's own behavior)", async () => {
    const ledger = new Ledger({ total: 1_000 }); // reserve = 120 (12%)
    const params = baseParams({ ledger, worstCase: 10_000 });

    const outcome = await runSeamStitch(params);
    expect(outcome.log.clamped).toBe(true);
  });

  it("never throws for insufficient budget — reserve draws always succeed (BUDGET.md §5 level 8)", async () => {
    const ledger = new Ledger({ total: 1 });
    const params = baseParams({ ledger, worstCase: 1_000_000 });
    await expect(runSeamStitch(params)).resolves.toBeDefined();
  });
});
