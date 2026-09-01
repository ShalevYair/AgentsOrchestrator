import { describe, expect, it } from "vitest";
import { BudgetReserveLockedError, ConfigError, type Usage } from "@ao/shared";
import { Ledger } from "./ledger.js";

function usage(overrides: Partial<Usage> = {}): Usage {
  return { promptTokens: 1000, candidatesTokens: 200, thoughtsTokens: 0, cachedTokens: 0, ...overrides };
}

describe("Ledger — P4-T1 totals", () => {
  it("starts with the full total available, nothing spent or committed", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    expect(ledger.total).toBe(1_000_000);
    expect(ledger.spent).toBe(0);
    expect(ledger.committed).toBe(0);
    expect(ledger.reserve).toBe(120_000);
    expect(ledger.available).toBe(1_000_000 - 120_000);
  });

  it("is a plain synchronous class — no method returns a Promise", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const reservation = ledger.commit(100, { bucket: "execution", stageId: "s1" });
    expect(reservation).not.toBeInstanceOf(Promise);
    expect(ledger.settle(reservation, usage())).not.toBeInstanceOf(Promise);
  });

  it("tracks tokens and cost as fully separate metrics (ADR-004)", () => {
    const ledger = new Ledger({
      total: 1_000_000,
      pricing: () => ({ inputPerMillionUsd: 1, outputPerMillionUsd: 4 }),
    });
    const reservation = ledger.commit(1200, { bucket: "execution", stageId: "s1" });
    ledger.settle(reservation, usage(), "some-model");
    // token metric unaffected by pricing at all
    expect(ledger.spent).toBe(1200);
    // cost metric computed independently: 1000*1/1e6 + 200*4/1e6
    expect(ledger.costSpentUsd).toBeCloseTo(0.0018, 10);
  });

  it("settling without a modelId still updates tokens, contributing $0 cost", () => {
    const ledger = new Ledger({
      total: 1_000_000,
      pricing: () => ({ inputPerMillionUsd: 1, outputPerMillionUsd: 4 }),
    });
    const reservation = ledger.commit(500, { bucket: "execution", stageId: "s1" });
    ledger.settle(reservation, usage());
    expect(ledger.spent).toBe(1200);
    expect(ledger.costSpentUsd).toBe(0);
  });
});

describe("Ledger — commit/available", () => {
  it("commit reduces available and increases committed", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const before = ledger.available;
    ledger.commit(1000, { bucket: "execution", stageId: "s1" });
    expect(ledger.committed).toBe(1000);
    expect(ledger.available).toBe(before - 1000);
  });

  it("refuses to commit more than available", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    expect(() => ledger.commit(ledger.available + 1, { bucket: "execution", stageId: "s1" })).toThrow(
      ConfigError,
    );
  });

  it("refuses a negative commit amount", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    expect(() => ledger.commit(-10, { bucket: "execution", stageId: "s1" })).toThrow(ConfigError);
  });
});

describe("Ledger — reserve is locked (P4-T2 enforced through Ledger)", () => {
  it("rejects committing against the reserve bucket", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    expect(() => ledger.commit(10, { bucket: "reserve", stageId: "s1" })).toThrow(BudgetReserveLockedError);
  });

  it("rejects an unknown bucket id", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    expect(() => ledger.commit(10, { bucket: "not-a-bucket", stageId: "s1" })).toThrow();
  });

  it("drawFromReserve is the sole path that can spend reserve, and always succeeds", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const reservation = ledger.drawFromReserve(50_000, { stageId: "synth" });
    expect(reservation.amount).toBe(50_000);
    expect(reservation.clamped).toBe(false);
    expect(ledger.reserveSnapshot().committed).toBe(50_000);
    // available (the run-level, non-reserve pool) is untouched by a reserve draw
    expect(ledger.available).toBe(1_000_000 - 120_000);
  });

  it("drawFromReserve clamps rather than throwing once the reserve pool is exhausted — level 8 must always succeed", () => {
    const ledger = new Ledger({ total: 1_000_000 }); // reserve = 120,000
    const first = ledger.drawFromReserve(100_000, { stageId: "synth-1" });
    ledger.settle(first, usage({ promptTokens: 100_000, candidatesTokens: 0 }));
    const second = ledger.drawFromReserve(50_000, { stageId: "synth-2" });
    expect(second.clamped).toBe(true);
    expect(second.amount).toBe(20_000); // only 20,000 left of the 120,000 reserve
  });

  it("drawFromReserve never throws even when the reserve is fully drained to zero", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const drained = ledger.drawFromReserve(1_000_000, { stageId: "synth-1" }); // asks for way more than the 120,000 reserve
    expect(drained.amount).toBe(120_000);
    const empty = ledger.drawFromReserve(1, { stageId: "synth-2" });
    expect(empty.amount).toBe(0);
    expect(empty.clamped).toBe(true);
  });
});

describe("Ledger — P4-T4 settlement", () => {
  it("settle releases committed and moves the real usage into spent", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const reservation = ledger.commit(5000, { bucket: "execution", stageId: "s1" }); // worst-case
    expect(ledger.committed).toBe(5000);
    ledger.settle(reservation, usage({ promptTokens: 1000, candidatesTokens: 200 })); // actual, much less
    expect(ledger.committed).toBe(0);
    expect(ledger.spent).toBe(1200);
    // available grew back by the difference between the worst-case hold and the real spend
    expect(ledger.available).toBe(1_000_000 - 120_000 - 1200);
  });

  it("a failed call releases committed without adding anything to spent — no leak", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const reservation = ledger.commit(5000, { bucket: "execution", stageId: "s1" });
    ledger.release(reservation);
    expect(ledger.committed).toBe(0);
    expect(ledger.spent).toBe(0);
    expect(ledger.available).toBe(1_000_000 - 120_000);
  });

  it("a canceled call behaves identically to a failed one", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const reservation = ledger.commit(3000, { bucket: "execution", stageId: "s1" });
    ledger.release(reservation);
    expect(ledger.openReservationCount).toBe(0);
  });

  it("settling the same reservation twice throws instead of double-releasing", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const reservation = ledger.commit(1000, { bucket: "execution", stageId: "s1" });
    ledger.settle(reservation, usage());
    expect(() => ledger.settle(reservation, usage())).toThrow(ConfigError);
  });

  it("releasing an already-settled reservation throws instead of leaking a double-release", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const reservation = ledger.commit(1000, { bucket: "execution", stageId: "s1" });
    ledger.settle(reservation, usage());
    expect(() => ledger.release(reservation)).toThrow(ConfigError);
  });

  it("caches count at full token weight by default (ADR-004)", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const reservation = ledger.commit(2000, { bucket: "execution", stageId: "s1" });
    ledger.settle(reservation, usage({ promptTokens: 1000, cachedTokens: 400, candidatesTokens: 100 }));
    // 1000 prompt (cached already included within it, full weight) + 100 candidates
    expect(ledger.spent).toBe(1100);
  });

  it("cachedTokensWeight can discount the TOKEN metric itself when explicitly configured", () => {
    const ledger = new Ledger({ total: 1_000_000, cachedTokensWeight: 0.5 });
    const reservation = ledger.commit(2000, { bucket: "execution", stageId: "s1" });
    ledger.settle(reservation, usage({ promptTokens: 1000, cachedTokens: 400, candidatesTokens: 100 }));
    // 600 non-cached + 400*0.5 cached + 100 candidates = 900
    expect(ledger.spent).toBe(900);
  });

  it("cost applies its own discount for cached tokens, independent of the token weight", () => {
    const ledger = new Ledger({
      total: 1_000_000,
      pricing: () => ({ inputPerMillionUsd: 2, outputPerMillionUsd: 8, cachedInputPerMillionUsd: 0.5 }),
    });
    const reservation = ledger.commit(2000, { bucket: "execution", stageId: "s1" });
    ledger.settle(reservation, usage({ promptTokens: 1000, cachedTokens: 400, candidatesTokens: 0 }), "m");
    // (600 * 2 + 400 * 0.5) / 1e6
    expect(ledger.costSpentUsd).toBeCloseTo((600 * 2 + 400 * 0.5) / 1_000_000, 12);
  });
});

describe("Ledger — per-stage and per-run breakdown", () => {
  it("tracks spend by stageId and by agentType", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const r1 = ledger.commit(1000, { bucket: "execution", stageId: "s1", agentType: "reader" });
    ledger.settle(r1, usage({ promptTokens: 500, candidatesTokens: 100 }));
    const r2 = ledger.commit(1000, { bucket: "execution", stageId: "s2", agentType: "reader" });
    ledger.settle(r2, usage({ promptTokens: 300, candidatesTokens: 50 }));

    const snapshot = ledger.snapshot();
    expect(snapshot.byStage["s1"]?.spent).toBe(600);
    expect(snapshot.byStage["s2"]?.spent).toBe(350);
    expect(snapshot.byAgentType["reader"]?.spent).toBe(950);
  });

  it("snapshot exposes bucket-level allocation/spent/committed/available", () => {
    const ledger = new Ledger({ total: 1_000_000 });
    const r = ledger.commit(1000, { bucket: "recon", stageId: "s1" });
    const snapshot = ledger.snapshot();
    expect(snapshot.buckets.recon.allocated).toBe(20_000);
    expect(snapshot.buckets.recon.committed).toBe(1000);
    expect(snapshot.buckets.recon.available).toBe(19_000);
    ledger.settle(r, usage({ promptTokens: 100, candidatesTokens: 0 }));
    expect(ledger.snapshot().buckets.recon.spent).toBe(100);
  });
});
