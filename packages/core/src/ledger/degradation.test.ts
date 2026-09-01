import { describe, expect, it } from "vitest";
import { applyDegradationStep, runDegradationLadder } from "./degradation.js";
import { Ledger } from "./ledger.js";
import type { DegradableSpec } from "./types.js";

function baseSpec(overrides: Partial<DegradableSpec> = {}): DegradableSpec {
  return {
    retrievalK: 8,
    thinkingLevel: "high",
    fanoutCount: 6,
    fanoutMode: "shard",
    tier: "worker",
    readRung: "R4",
    optional: false,
    ...overrides,
  };
}

function specWithoutRetrievalK(overrides: Partial<Omit<DegradableSpec, "retrievalK">> = {}): DegradableSpec {
  const spec = baseSpec(overrides);
  delete spec.retrievalK;
  return spec;
}

describe("applyDegradationStep — each of the 8 levels (P4-T5)", () => {
  it("level 1: halves retrievalK, floored at 1", () => {
    const result = applyDegradationStep(1, baseSpec({ retrievalK: 8 }));
    expect(result?.retrievalK).toBe(4);
    expect(applyDegradationStep(1, baseSpec({ retrievalK: 1 }))).toBeNull();
    expect(applyDegradationStep(1, specWithoutRetrievalK())).toBeNull();
  });

  it("level 2: lowers thinkingLevel one notch, floored at low", () => {
    expect(applyDegradationStep(2, baseSpec({ thinkingLevel: "high" }))?.thinkingLevel).toBe("medium");
    expect(applyDegradationStep(2, baseSpec({ thinkingLevel: "medium" }))?.thinkingLevel).toBe("low");
    expect(applyDegradationStep(2, baseSpec({ thinkingLevel: "low" }))).toBeNull();
  });

  it("level 3: reduces fanout.count (merges shards), floored at 1", () => {
    expect(applyDegradationStep(3, baseSpec({ fanoutCount: 6 }))?.fanoutCount).toBe(3);
    expect(applyDegradationStep(3, baseSpec({ fanoutCount: 1 }))).toBeNull();
  });

  it("level 4: cancels ensemble/debate to single", () => {
    expect(applyDegradationStep(4, baseSpec({ fanoutMode: "ensemble" }))?.fanoutMode).toBe("single");
    expect(applyDegradationStep(4, baseSpec({ fanoutMode: "debate" }))?.fanoutMode).toBe("single");
    expect(applyDegradationStep(4, baseSpec({ fanoutMode: "shard" }))).toBeNull();
  });

  it("level 5: downgrades worker tier to cheap", () => {
    expect(applyDegradationStep(5, baseSpec({ tier: "worker" }))?.tier).toBe("cheap");
    expect(applyDegradationStep(5, baseSpec({ tier: "cheap" }))).toBeNull();
  });

  it("level 6: lowers the read rung one step, floored at R0", () => {
    expect(applyDegradationStep(6, baseSpec({ readRung: "R5" }))?.readRung).toBe("R4");
    expect(applyDegradationStep(6, baseSpec({ readRung: "R0" }))).toBeNull();
  });

  it("level 7: skips an optional stage only", () => {
    expect(applyDegradationStep(7, baseSpec({ optional: true }))?.skipped).toBe(true);
    expect(applyDegradationStep(7, baseSpec({ optional: false }))).toBeNull();
    expect(applyDegradationStep(7, baseSpec({ optional: true, skipped: true }))).toBeNull();
  });
});

describe("runDegradationLadder — policy: degrade (default)", () => {
  it("approves immediately with zero events when the plain request already fits", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 1000 },
      baseSpec(),
      () => 1000,
    );
    expect(outcome.decision).toBe("approved");
    expect(outcome.events).toHaveLength(0);
  });

  it("walks down the ladder, stopping at the first level that fits, and logs every level tried with a reason", () => {
    const ledger = new Ledger({ total: 1_000_000 }); // available = 880,000
    let calls = 0;
    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 2_000_000 },
      baseSpec({ retrievalK: 64 }),
      () => {
        calls += 1;
        // Levels 1 and 2 still don't fit; level 3 finally does.
        return calls < 3 ? 2_000_000 : 100_000;
      },
    );
    expect(outcome.decision).toBe("approved");
    expect(outcome.events).toHaveLength(3); // stopped right after the 3rd level — level 8 never reached
    expect(outcome.events.every((e) => e.level !== 8)).toBe(true);
    for (const event of outcome.events) {
      expect(event.reason.length).toBeGreaterThan(0);
      expect(event.stageId).toBe("s1");
    }
  });

  it("level 8 always succeeds even when nothing else could possibly fit", () => {
    const ledger = new Ledger({ total: 100_000 }); // reserve = 12,000
    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 999_999_999 },
      baseSpec({
        retrievalK: 1,
        thinkingLevel: "low",
        fanoutCount: 1,
        fanoutMode: "single",
        tier: "cheap",
        readRung: "R0",
        optional: false,
      }),
      () => 999_999_999, // recompute never shrinks below the impossible — nothing in levels 1-6 applies to this floor spec anyway
    );
    expect(outcome.decision).toBe("approved");
    if (outcome.decision === "approved") {
      expect(outcome.reservation.bucket).toBe("reserve");
      expect(outcome.reservation.amount).toBeLessThanOrEqual(12_000);
    }
    const level8 = outcome.events.find((e) => e.level === 8);
    expect(level8).toBeDefined();
    expect(level8?.reason.length).toBeGreaterThan(0);
  });

  it("level 7 (skip optional) short-circuits to a zero-cost admitted stage when the spec is optional", () => {
    const ledger = new Ledger({ total: 100_000 });
    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 999_999_999 },
      baseSpec({
        retrievalK: 1,
        thinkingLevel: "low",
        fanoutCount: 1,
        fanoutMode: "single",
        tier: "cheap",
        readRung: "R0",
        optional: true,
      }),
      (spec) => (spec.skipped ? 0 : 999_999_999),
    );
    expect(outcome.decision).toBe("approved");
    if (outcome.decision === "approved") {
      expect(outcome.spec.skipped).toBe(true);
      expect(outcome.reservation.amount).toBe(0);
    }
    const level8 = outcome.events.find((e) => e.level === 8);
    expect(level8).toBeUndefined(); // level 7 already fit — never reached level 8
  });
});

describe("runDegradationLadder — policy: hard-stop", () => {
  it("jumps straight to level 8 without trying levels 1-7", () => {
    const ledger = new Ledger({ total: 100_000 });
    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 999_999 },
      baseSpec(),
      () => 999_999,
      { policy: "hard-stop" },
    );
    expect(outcome.decision).toBe("approved");
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events[0]?.level).toBe(8);
  });
});

describe("runDegradationLadder — policy: ask", () => {
  it("never auto-degrades — surfaces needs-user-decision the moment plain admission fails", () => {
    const ledger = new Ledger({ total: 100_000 });
    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 999_999 },
      baseSpec(),
      () => 999_999,
      { policy: "ask" },
    );
    expect(outcome.decision).toBe("needs-user-decision");
    expect(outcome.events).toHaveLength(0);
    expect(ledger.committed).toBe(0); // nothing was ever reserved
  });

  it("still approves directly, with no user decision needed, when the plain request already fits", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 1000 },
      baseSpec(),
      () => 1000,
      { policy: "ask" },
    );
    expect(outcome.decision).toBe("approved");
  });
});
