import { describe, expect, it } from "vitest";
import { EgressLedger } from "./egress-ledger.js";

describe("EgressLedger", () => {
  it("records an entry with an assigned seq and timestamp", () => {
    const ledger = new EgressLedger();
    const record = ledger.record({ callId: "call1", bytes: 100, artifactRefs: ["a1"], redactions: 0 });
    expect(record.seq).toBe(0);
    expect(record.timestamp).toBeGreaterThan(0);
    expect(ledger.all()).toHaveLength(1);
  });

  it("assigns increasing seq numbers across records", () => {
    const ledger = new EgressLedger();
    const r1 = ledger.record({ callId: "c1", bytes: 1, artifactRefs: [], redactions: 0 });
    const r2 = ledger.record({ callId: "c2", bytes: 1, artifactRefs: [], redactions: 0 });
    expect(r2.seq).toBe(r1.seq + 1);
  });

  it("totalBytes sums every recorded call", () => {
    const ledger = new EgressLedger();
    ledger.record({ callId: "c1", bytes: 100, artifactRefs: [], redactions: 0 });
    ledger.record({ callId: "c2", bytes: 250, artifactRefs: [], redactions: 0 });
    expect(ledger.totalBytes()).toBe(350);
  });

  it("forCall filters to a single call's records", () => {
    const ledger = new EgressLedger();
    ledger.record({ callId: "c1", bytes: 10, artifactRefs: [], redactions: 0 });
    ledger.record({ callId: "c1", bytes: 20, artifactRefs: [], redactions: 0 });
    ledger.record({ callId: "c2", bytes: 30, artifactRefs: [], redactions: 0 });
    expect(ledger.forCall("c1")).toHaveLength(2);
    expect(ledger.forCall("c2")).toHaveLength(1);
  });

  it("forArtifact finds every call that cited a given artifact", () => {
    const ledger = new EgressLedger();
    ledger.record({ callId: "c1", bytes: 10, artifactRefs: ["a1", "a2"], redactions: 0 });
    ledger.record({ callId: "c2", bytes: 20, artifactRefs: ["a2"], redactions: 0 });
    ledger.record({ callId: "c3", bytes: 30, artifactRefs: ["a3"], redactions: 0 });
    expect(ledger.forArtifact("a2").map((r) => r.callId)).toEqual(["c1", "c2"]);
  });

  describe("summary()", () => {
    it("reports totalBytes, totalRedactions, callCount", () => {
      const ledger = new EgressLedger();
      ledger.record({ callId: "c1", bytes: 100, artifactRefs: ["a1"], redactions: 2 });
      ledger.record({ callId: "c2", bytes: 50, artifactRefs: ["a1"], redactions: 1 });

      const summary = ledger.summary();
      expect(summary.totalBytes).toBe(150);
      expect(summary.totalRedactions).toBe(3);
      expect(summary.callCount).toBe(2);
    });

    it("splits a call's bytes evenly across the artifacts it cites", () => {
      const ledger = new EgressLedger();
      ledger.record({ callId: "c1", bytes: 100, artifactRefs: ["a1", "a2"], redactions: 0 });

      const summary = ledger.summary();
      expect(summary.byArtifact).toEqual(
        expect.arrayContaining([
          { artifactId: "a1", bytes: 50 },
          { artifactId: "a2", bytes: 50 },
        ]),
      );
    });

    it("aggregates a single artifact across multiple calls, sorted by bytes descending", () => {
      const ledger = new EgressLedger();
      ledger.record({ callId: "c1", bytes: 30, artifactRefs: ["small"], redactions: 0 });
      ledger.record({ callId: "c2", bytes: 90, artifactRefs: ["big"], redactions: 0 });
      ledger.record({ callId: "c3", bytes: 20, artifactRefs: ["small"], redactions: 0 });

      const summary = ledger.summary();
      expect(summary.byArtifact).toEqual([
        { artifactId: "big", bytes: 90 },
        { artifactId: "small", bytes: 50 },
      ]);
    });

    it("ignores records with no artifact refs in the byArtifact breakdown, but still counts their bytes", () => {
      const ledger = new EgressLedger();
      ledger.record({ callId: "c1", bytes: 100, artifactRefs: [], redactions: 0 });
      const summary = ledger.summary();
      expect(summary.totalBytes).toBe(100);
      expect(summary.byArtifact).toEqual([]);
    });

    it("returns zeros for an empty ledger", () => {
      const ledger = new EgressLedger();
      expect(ledger.summary()).toEqual({
        totalBytes: 0,
        totalRedactions: 0,
        callCount: 0,
        byArtifact: [],
      });
    });
  });

  describe("persistence", () => {
    it("round-trips through toJSON/fromJSON", () => {
      const ledger = new EgressLedger();
      ledger.record({ callId: "c1", bytes: 42, artifactRefs: ["a1"], redactions: 1 });

      const restored = EgressLedger.fromJSON(ledger.toJSON());
      expect(restored.all()).toEqual(ledger.all());
      expect(restored.totalBytes()).toBe(42);
    });

    it("continues seq numbering after restoring from JSON", () => {
      const ledger = new EgressLedger();
      ledger.record({ callId: "c1", bytes: 1, artifactRefs: [], redactions: 0 });
      ledger.record({ callId: "c2", bytes: 1, artifactRefs: [], redactions: 0 });

      const restored = EgressLedger.fromJSON(ledger.toJSON());
      const next = restored.record({ callId: "c3", bytes: 1, artifactRefs: [], redactions: 0 });
      expect(next.seq).toBe(2);
    });
  });
});
