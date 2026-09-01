import type { RuntimeEvent } from "@ao/shared";
import { RuntimeEventSchema } from "@ao/shared";
import type { WebSocket } from "ws";
import type { SqlDriver } from "../db/driver.js";
import { appendEvent, listEventsSince } from "../db/events.repo.js";

type EventType = RuntimeEvent["type"];
type PayloadOf<T extends EventType> = Extract<RuntimeEvent, { type: T }>["payload"];

interface Subscriber {
  runId: string;
}

/**
 * PROTOCOLS.md §9 / P2-T6. Every event is durably appended to the `events`
 * table BEFORE it is broadcast (so a client that was never connected can
 * still fetch it later via `listEventsSince`), then pushed to any WS
 * connection currently subscribed to that run.
 *
 * Reconnect gap-filling: `subscribe()` first replays everything with
 * `seq > sinceSeq` from the DB, THEN marks the connection live. Both the
 * DB read and the subscriber-map mutation are synchronous (node:sqlite is
 * synchronous, and this function never awaits between them), so there is
 * no window in which an event `publish()`ed concurrently could be both
 * missed by the replay AND missed by live forwarding — single-threaded JS
 * guarantees `subscribe()` runs to completion before any other handler
 * (including another `publish()` call) gets a turn.
 */
export class EventHub {
  private readonly subscribers = new Map<WebSocket, Subscriber>();

  constructor(private readonly driver: SqlDriver) {}

  subscribe(ws: WebSocket, runId: string, sinceSeq: number): void {
    const missed = listEventsSince(this.driver, runId, sinceSeq);
    for (const stored of missed) {
      this.send(ws, RuntimeEventSchema.parse(stored));
    }
    this.subscribers.set(ws, { runId });
  }

  unsubscribe(ws: WebSocket): void {
    this.subscribers.delete(ws);
  }

  /**
   * Validates the fully-assembled envelope against `RuntimeEventSchema`
   * (the same zod schema PROTOCOLS.md §9's wire format is defined by) —
   * so a bug that ever produced a malformed event fails loudly here
   * instead of reaching the UI as silently-wrong JSON.
   */
  publish<T extends EventType>(runId: string, type: T, payload: PayloadOf<T>): RuntimeEvent {
    const stored = appendEvent(this.driver, { runId, type, payload });
    const event = RuntimeEventSchema.parse({ type, runId, seq: stored.seq, payload });
    for (const [ws, sub] of this.subscribers) {
      if (sub.runId === runId && ws.readyState === ws.OPEN) {
        this.send(ws, event);
      }
    }
    return event;
  }

  private send(ws: WebSocket, event: RuntimeEvent): void {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(event));
  }
}
