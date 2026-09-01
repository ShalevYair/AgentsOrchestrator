import { describe, expect, it } from "vitest";
import { BudgetReserveLockedError, ConfigError } from "@ao/shared";
import {
  allocateBudget,
  assertSpendableBucket,
  DEFAULT_BUCKET_PERCENTAGES,
  RESERVE_PERCENTAGE,
} from "./buckets.js";
import { BUDGET_BUCKET_IDS } from "./types.js";

describe("allocateBudget", () => {
  it("splits the total per BUDGET.md §3's default percentages", () => {
    const allocation = allocateBudget(2_500_000);
    expect(allocation.buckets.recon).toBe(50_000);
    expect(allocation.buckets.planning).toBe(75_000);
    expect(allocation.buckets.checkpoints).toBe(100_000);
    expect(allocation.buckets.execution).toBe(1_450_000);
    expect(allocation.buckets.synthesis).toBe(300_000);
    expect(allocation.buckets.repair).toBe(225_000);
    expect(allocation.reserve).toBe(300_000);
  });

  it("never exposes a way to pass a reserve override — the signature has no such parameter", () => {
    // Type-level assertion: DEFAULT_BUCKET_PERCENTAGES itself has no "reserve" key.
    expect(Object.keys(DEFAULT_BUCKET_PERCENTAGES)).not.toContain("reserve");
    expect(RESERVE_PERCENTAGE).toBe(0.12);
  });

  it("conserves the total: buckets + reserve never exceed it", () => {
    const allocation = allocateBudget(500_000);
    const sum = BUDGET_BUCKET_IDS.reduce((acc, id) => acc + allocation.buckets[id], 0) + allocation.reserve;
    expect(sum).toBeLessThanOrEqual(500_000);
  });

  it("allows tuning the six normal buckets", () => {
    const allocation = allocateBudget(1_000_000, {
      execution: 0.5,
      recon: 0.02,
      planning: 0.02,
      checkpoints: 0.02,
      synthesis: 0.1,
      repair: 0.02,
    });
    expect(allocation.buckets.execution).toBe(500_000);
  });

  it("rejects a bucket configuration that, combined with the fixed reserve, exceeds 100%", () => {
    expect(() => allocateBudget(1_000_000, { execution: 0.95 })).toThrow(ConfigError);
  });

  it("rejects a negative bucket percentage", () => {
    expect(() => allocateBudget(1_000_000, { execution: -0.1 })).toThrow(ConfigError);
  });

  it("rejects a non-positive total", () => {
    expect(() => allocateBudget(0)).toThrow(ConfigError);
    expect(() => allocateBudget(-100)).toThrow(ConfigError);
  });
});

describe("assertSpendableBucket", () => {
  it("accepts every normal bucket id", () => {
    for (const id of BUDGET_BUCKET_IDS) {
      expect(() => assertSpendableBucket(id)).not.toThrow();
    }
  });

  it("rejects the locked reserve bucket — this is P4-T2's required failing test", () => {
    expect(() => assertSpendableBucket("reserve")).toThrow(BudgetReserveLockedError);
  });

  it("rejects an unknown bucket id rather than silently allowing it through", () => {
    expect(() => assertSpendableBucket("not-a-real-bucket")).toThrow(ConfigError);
  });
});
