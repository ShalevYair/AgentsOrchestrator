import { describe, expect, it } from "vitest";
import type { Usage } from "@ao/shared";
import { Ledger } from "./ledger.js";
import { buildTokenReport, SAVINGS_LEVER_IDS, type SavingsRecord } from "./report.js";
import type { DegradationEvent } from "./types.js";

function usage(overrides: Partial<Usage> = {}): Usage {
  return { promptTokens: 500, candidatesTokens: 100, thoughtsTokens: 0, cachedTokens: 0, ...overrides };
}

describe("buildTokenReport — P4-T8", () => {
  it("reflects the Ledger's own spend/committed and per-stage/agent breakdown", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const r1 = ledger.commit(1000, { bucket: "execution", stageId: "s1", agentType: "reader" });
    ledger.settle(r1, usage({ promptTokens: 500, candidatesTokens: 100 }));
    ledger.commit(2000, { bucket: "execution", stageId: "s2", agentType: "writer" });

    const report = buildTokenReport(ledger);
    expect(report.totalSpent).toBe(600);
    expect(report.totalCommitted).toBe(2000);
    expect(report.byStage["s1"]?.spent).toBe(600);
    expect(report.byAgentType["writer"]?.committed).toBe(2000);
  });

  it("initializes every known savings lever to 0 even with no records", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const report = buildTokenReport(ledger);
    for (const lever of SAVINGS_LEVER_IDS) {
      expect(report.byLever[lever]).toBe(0);
    }
    expect(report.totalSaved).toBe(0);
  });

  it("aggregates savings records per lever and into a grand total", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const savings: SavingsRecord[] = [
      { lever: "local-processing", tokensSaved: 2_100_000, note: "RepoMap instead of raw reads" },
      { lever: "local-processing", tokensSaved: 50_000 },
      { lever: "response-cache", tokensSaved: 8_000 },
    ];
    const report = buildTokenReport(ledger, savings);
    expect(report.byLever["local-processing"]).toBe(2_150_000);
    expect(report.byLever["response-cache"]).toBe(8_000);
    expect(report.byLever["context-cache"]).toBe(0);
    expect(report.totalSaved).toBe(2_158_000);
  });

  it("summarizes degradation events by level", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const events: DegradationEvent[] = [
      {
        level: 1,
        action: "reduce-retrieval-k",
        reason: "over budget",
        stageId: "s1",
        worstCaseBefore: 100,
        worstCaseAfter: 50,
      },
      {
        level: 1,
        action: "reduce-retrieval-k",
        reason: "over budget",
        stageId: "s2",
        worstCaseBefore: 100,
        worstCaseAfter: 50,
      },
      {
        level: 3,
        action: "reduce-fanout-count",
        reason: "still over",
        stageId: "s2",
        worstCaseBefore: 50,
        worstCaseAfter: 30,
      },
    ];
    const report = buildTokenReport(ledger, [], events);
    expect(report.degradationCountByLevel[1]).toBe(2);
    expect(report.degradationCountByLevel[3]).toBe(1);
    expect(report.degradations).toHaveLength(3);
  });

  it("reports reserve draws separately from normal spend, and rolls both into grandTotalSpent", () => {
    const ledger = new Ledger({ total: 100_000 }); // reserve = 12,000
    const normal = ledger.commit(1000, { bucket: "execution", stageId: "s1" });
    ledger.settle(normal, usage({ promptTokens: 500, candidatesTokens: 100 }));
    const reserveReservation = ledger.drawFromReserve(5000, { stageId: "s2" });
    ledger.settle(reserveReservation, usage({ promptTokens: 4000, candidatesTokens: 1000 }));

    const report = buildTokenReport(ledger);
    expect(report.totalSpent).toBe(600); // normal buckets only
    expect(report.reserveSpent).toBe(5000);
    expect(report.grandTotalSpent).toBe(5600);
  });

  it("carries total cost in USD from the Ledger", () => {
    const ledger = new Ledger({
      total: 1_000_000,
      pricing: () => ({ inputPerMillionUsd: 1, outputPerMillionUsd: 4 }),
    });
    const r = ledger.commit(1000, { bucket: "execution", stageId: "s1" });
    ledger.settle(r, usage({ promptTokens: 500, candidatesTokens: 100 }), "m");
    const report = buildTokenReport(ledger);
    expect(report.totalCostUsd).toBeCloseTo((500 * 1 + 100 * 4) / 1_000_000, 12);
  });
});
