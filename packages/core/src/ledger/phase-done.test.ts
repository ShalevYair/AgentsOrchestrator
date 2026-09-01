import { describe, expect, it } from "vitest";
import { runDegradationLadder } from "./degradation.js";
import { Ledger } from "./ledger.js";
import { buildTokenReport } from "./report.js";
import type { DegradableSpec, DegradationEvent } from "./types.js";

/**
 * P4's own phase-level "definition of done" (TASKS.md): a run with an
 * artificially low budget successfully degrades and still returns a
 * deliverable, instead of overrunning the ledger or hanging. `core` has no
 * scheduler yet (that's P5), so this exercises the full slice P4 owns —
 * Ledger + admission + the 8-level ladder + the post-run report — end to
 * end against a budget deliberately too small for the naive plan.
 */
describe("P4 phase-level done criterion", () => {
  it("a deliberately tiny budget still ends in an admitted call and a coherent report — never a hang or an overrun", () => {
    const ledger = new Ledger({ total: 20_000 }); // reserve = 2,400; available ≈ 17,600
    const allEvents: DegradationEvent[] = [];

    const spec: DegradableSpec = {
      retrievalK: 16,
      thinkingLevel: "high",
      fanoutCount: 8,
      fanoutMode: "ensemble",
      tier: "worker",
      readRung: "R5",
      optional: false,
    };

    // A naive worst-case for this stage (huge fan-out, full read rung, high
    // thinking) that could never fit a 20K-token run un-degraded.
    const worstCase = 5_000_000;
    const recompute = (s: DegradableSpec): number => {
      // A crude but monotonic stand-in for a real re-estimate: every
      // knob turned down roughly halves the cost.
      let estimate = 5_000_000;
      if (s.retrievalK !== undefined) estimate = Math.floor(estimate * (s.retrievalK / 16));
      if (s.thinkingLevel === "medium") estimate = Math.floor(estimate * 0.7);
      if (s.thinkingLevel === "low") estimate = Math.floor(estimate * 0.5);
      estimate = Math.floor(estimate * (s.fanoutCount / 8));
      if (s.tier === "cheap") estimate = Math.floor(estimate * 0.4);
      return Math.max(1, estimate);
    };

    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase },
      spec,
      recompute,
    );
    allEvents.push(...outcome.events);

    // The run is always admitted — never rejected, never left hanging.
    expect(outcome.decision).toBe("approved");
    if (outcome.decision !== "approved") return;

    // Settle it as if the (degraded) call actually ran, producing a real deliverable.
    ledger.settle(outcome.reservation, {
      promptTokens: Math.floor(outcome.reservation.amount * 0.7),
      candidatesTokens: Math.floor(outcome.reservation.amount * 0.3),
      thoughtsTokens: 0,
      cachedTokens: 0,
    });

    // The ledger never went negative or leaked a reservation.
    expect(ledger.available).toBeGreaterThanOrEqual(0);
    expect(ledger.openReservationCount).toBe(0);

    // A caller can always produce a "where did tokens go" report, whether or
    // not degradation was needed — the report itself never fails or hangs.
    const report = buildTokenReport(ledger, [], allEvents);
    // The whole reservation was granted from the locked reserve (level 8),
    // so the spend shows up under reserveSpent, not the normal totalSpent —
    // grandTotalSpent is what actually proves a deliverable got produced.
    expect(report.grandTotalSpent).toBeGreaterThan(0);
    expect(report.reserveSpent).toBeGreaterThan(0);
    expect(report.degradations.length).toBeGreaterThan(0);
    expect(report.degradations.some((e) => e.level === 8)).toBe(true); // this budget is tiny enough that even full degradation needed the reserve
  });

  it("a generous budget needs no degradation at all, and the report reflects that cleanly", () => {
    const ledger = new Ledger({ total: 5_000_000 });
    const outcome = runDegradationLadder(
      ledger,
      { bucket: "execution", stageId: "s1", worstCase: 200_000 },
      {
        retrievalK: 8,
        thinkingLevel: "medium",
        fanoutCount: 4,
        fanoutMode: "shard",
        tier: "worker",
        readRung: "R3",
        optional: false,
      },
      () => 200_000,
    );
    expect(outcome.decision).toBe("approved");
    expect(outcome.events).toHaveLength(0);
    if (outcome.decision !== "approved") return;
    ledger.settle(outcome.reservation, {
      promptTokens: 150_000,
      candidatesTokens: 20_000,
      thoughtsTokens: 0,
      cachedTokens: 0,
    });
    const report = buildTokenReport(ledger, [], outcome.events);
    expect(report.degradations).toHaveLength(0);
  });
});
