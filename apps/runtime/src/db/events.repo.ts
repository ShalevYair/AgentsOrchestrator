import type { SqlDriver } from "./driver.js";

/**
 * Generic on purpose: the concrete per-`type` payload shapes live in
 * `RuntimeEventSchema` (`@ao/shared`, PROTOCOLS.md §9) — the hub
 * (P2-T6) validates against that schema before ever calling `appendEvent`,
 * so this repository only needs to move `{type, runId, seq, payload}`
 * bytes to and from SQLite, not re-describe the wire protocol.
 */
export interface StoredEvent<Payload = unknown> {
  type: string;
  runId: string;
  seq: number;
  payload: Payload;
}

interface EventRow {
  run_id: string;
  seq: number;
  type: string;
  payload_json: string;
}

function fromRow(row: EventRow): StoredEvent {
  return {
    type: row.type,
    runId: row.run_id,
    seq: row.seq,
    payload: JSON.parse(row.payload_json) as unknown,
  };
}

/** Next `seq` for a run — synchronous, and only ever called from `appendEvent` in the same tick as the insert, so two events for one run can never race onto the same seq (see ws/hub.ts). */
export function nextSeq(driver: SqlDriver, runId: string): number {
  const row = driver.get<{ next: number }>(
    "SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM events WHERE run_id = ?",
    [runId],
  );
  return row?.next ?? 0;
}

export interface AppendEventInput<Payload = unknown> {
  runId: string;
  type: string;
  payload: Payload;
}

export function appendEvent<Payload>(
  driver: SqlDriver,
  input: AppendEventInput<Payload>,
): StoredEvent<Payload> {
  const seq = nextSeq(driver, input.runId);
  const event: StoredEvent<Payload> = { type: input.type, runId: input.runId, seq, payload: input.payload };
  driver.run("INSERT INTO events (run_id, seq, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)", [
    event.runId,
    event.seq,
    event.type,
    JSON.stringify(event.payload),
    new Date().toISOString(),
  ]);
  return event;
}

/** Everything for `runId` with `seq > sinceSeq`, ordered — the reconnect gap-fill query (P2-T6). */
export function listEventsSince(driver: SqlDriver, runId: string, sinceSeq: number): StoredEvent[] {
  return driver
    .all<EventRow>(
      "SELECT run_id, seq, type, payload_json FROM events WHERE run_id = ? AND seq > ? ORDER BY seq ASC",
      [runId, sinceSeq],
    )
    .map(fromRow);
}
