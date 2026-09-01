/**
 * Records every outbound byte, linked to the artifact(s) it came from and
 * the call it went out with (P3-T10). This is the data source for the
 * "what left this machine" panel (UX.md §7) and the `egress.recorded`
 * runtime event (PROTOCOLS.md §9) — it only records what callers report;
 * redaction itself happens upstream (`@ao/providers`'s `redactPayload`)
 * before a payload is ever handed to this ledger.
 */
export interface EgressRecordInput {
  callId: string;
  bytes: number;
  artifactRefs: string[];
  redactions: number;
}

export interface EgressRecord extends EgressRecordInput {
  seq: number;
  timestamp: number;
}

export interface EgressSummary {
  totalBytes: number;
  totalRedactions: number;
  callCount: number;
  byArtifact: { artifactId: string; bytes: number }[];
}

export class EgressLedger {
  readonly #records: EgressRecord[] = [];
  #seq = 0;

  record(input: EgressRecordInput): EgressRecord {
    const record: EgressRecord = { ...input, seq: this.#seq++, timestamp: Date.now() };
    this.#records.push(record);
    return record;
  }

  all(): readonly EgressRecord[] {
    return this.#records;
  }

  forCall(callId: string): EgressRecord[] {
    return this.#records.filter((r) => r.callId === callId);
  }

  forArtifact(artifactId: string): EgressRecord[] {
    return this.#records.filter((r) => r.artifactRefs.includes(artifactId));
  }

  totalBytes(): number {
    return this.#records.reduce((sum, r) => sum + r.bytes, 0);
  }

  /**
   * A per-artifact breakdown for the egress panel. Splits each record's
   * bytes evenly across the artifacts it cites — this is a display
   * estimate, not an exact accounting (a payload rarely maps 1:1 back to
   * byte ranges of specific source artifacts), which is why it's reported
   * separately from `totalBytes` (the actual, exact figure).
   */
  summary(): EgressSummary {
    const byArtifact = new Map<string, number>();
    let totalRedactions = 0;

    for (const record of this.#records) {
      totalRedactions += record.redactions;
      if (record.artifactRefs.length === 0) continue;
      const share = record.bytes / record.artifactRefs.length;
      for (const artifactId of record.artifactRefs) {
        byArtifact.set(artifactId, (byArtifact.get(artifactId) ?? 0) + share);
      }
    }

    return {
      totalBytes: this.totalBytes(),
      totalRedactions,
      callCount: this.#records.length,
      byArtifact: [...byArtifact.entries()]
        .map(([artifactId, bytes]) => ({ artifactId, bytes: Math.round(bytes) }))
        .sort((a, b) => b.bytes - a.bytes),
    };
  }

  toJSON(): EgressRecord[] {
    return [...this.#records];
  }

  static fromJSON(records: EgressRecord[]): EgressLedger {
    const ledger = new EgressLedger();
    for (const record of records) {
      ledger.#records.push(record);
      ledger.#seq = Math.max(ledger.#seq, record.seq + 1);
    }
    return ledger;
  }
}
