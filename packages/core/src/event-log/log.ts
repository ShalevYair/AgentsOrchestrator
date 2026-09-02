import { RuntimeEventSchema, type RuntimeEvent } from "@ao/shared";

export interface ParsedEventLog {
  events: RuntimeEvent[];
  /** Lines that failed to parse as JSON or didn't match `RuntimeEventSchema` — excludes a truncated trailing line (see `parseEventLog`'s doc comment), same distinction P5-T7's NDJSON parser makes. */
  droppedLines: number;
}

/**
 * Parses a previously-serialized `events.jsonl` file's text back into
 * `RuntimeEvent`s. Deliberately tolerant of a truncated final line — a
 * crash mid-`events.jsonl`-write (ADR-008's whole reason for existing:
 * "העלות — כתיבת אירועים — זניחה" means writes are frequent and small,
 * so a crash landing mid-line is a realistic scenario, not an edge case)
 * must not lose every event that *did* finish writing, and must not throw
 * — the same reasoning and mechanics as P5-T7's NDJSON parser, applied to
 * a different schema (`RuntimeEventSchema` instead of `NdjsonEnvelopeSchema`),
 * so this is its own small implementation rather than a forced shared
 * generic between two genuinely different domains.
 */
export function parseEventLog(text: string): ParsedEventLog {
  const rawLines = text.split("\n");
  const endsWithNewline = text.length === 0 || text.endsWith("\n");
  const lastIndex = rawLines.length - 1;

  const events: RuntimeEvent[] = [];
  let droppedLines = 0;

  rawLines.forEach((raw, index) => {
    const line = raw.trim();
    if (line.length === 0) return;
    const isTrailingUnterminated = !endsWithNewline && index === lastIndex;

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      if (!isTrailingUnterminated) droppedLines += 1;
      return;
    }
    const result = RuntimeEventSchema.safeParse(json);
    if (!result.success) {
      if (!isTrailingUnterminated) droppedLines += 1;
      return;
    }
    events.push(result.data);
  });

  return { events, droppedLines };
}

/**
 * P5-T12 — an in-memory, append-only event log matching PROTOCOLS.md §9's
 * envelope (`{type, runId, seq, payload}`, `seq` strictly increasing) and
 * ADR-008's event-sourcing model. `serialize`/`fromSerialized` are this
 * class's own NDJSON encode/decode pair — the actual `runs/<runId>/events.jsonl`
 * file write/read is disk I/O and stays the composition root's job
 * (`apps/runtime`, not built in this phase), the same boundary P5-T6/T9
 * already drew for `agent.md` loading and Blackboard persistence.
 */
export class EventLog {
  readonly runId: string;
  private readonly events: RuntimeEvent[] = [];
  private nextSeq = 0;

  constructor(runId: string) {
    this.runId = runId;
  }

  /**
   * Appends `event`, overwriting whatever `seq` the caller supplied with
   * the log's own next value — callers pass any placeholder (e.g. `-1`)
   * for `seq` since only this method may actually assign it, which is what
   * keeps `seq` strictly increasing and gap-free within one log.
   */
  append(event: RuntimeEvent): RuntimeEvent {
    const sequenced = { ...event, runId: this.runId, seq: this.nextSeq };
    this.nextSeq += 1;
    this.events.push(sequenced);
    return sequenced;
  }

  all(): readonly RuntimeEvent[] {
    return this.events;
  }

  /** Every event with `seq > afterSeq` — the same "reconnect and fill gaps" query PROTOCOLS.md §9 describes for the WebSocket layer (P2-T6), reused here as the log's general catch-up read. */
  after(afterSeq: number): readonly RuntimeEvent[] {
    return this.events.filter((e) => e.seq > afterSeq);
  }

  get length(): number {
    return this.events.length;
  }

  serialize(): string {
    if (this.events.length === 0) return "";
    return this.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  }

  /** Rebuilds a log from previously-serialized text — tolerant of a truncated trailing line (`parseEventLog`). `nextSeq` resumes from one past the highest `seq` found, so appending after a restore continues the same sequence rather than restarting it. */
  static fromSerialized(runId: string, text: string): EventLog {
    const log = new EventLog(runId);
    const { events } = parseEventLog(text);
    for (const event of events) {
      log.events.push(event);
      log.nextSeq = Math.max(log.nextSeq, event.seq + 1);
    }
    return log;
  }
}
