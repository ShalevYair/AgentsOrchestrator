import type { RuntimeEvent } from "@ao/shared";

export type WsStatus = "connecting" | "open" | "reconnecting";

interface RunEventSocketHandlers {
  onEvent: (event: RuntimeEvent) => void;
  onStatusChange?: (status: WsStatus) => void;
}

const RECONNECT_DELAY_MS = 1000;

/**
 * P2-T6 client side of reconnect gap-filling: tracks the last `seq` this
 * connection has actually delivered to `onEvent`, and on every (re)connect
 * — including the very first one — sends `{type:"subscribe", runId,
 * sinceSeq: lastSeq}`. The server (ws/hub.ts) replays anything after that
 * seq from its durable event log before going live, so a dropped
 * connection mid-run never loses or duplicates an event; see
 * apps/runtime/src/ws/reconnect.test.ts for the server-side proof, and
 * Markdown.test.tsx-adjacent component tests aren't the place to
 * re-prove the wire protocol, just to use it correctly.
 */
export class RunEventSocket {
  private ws: WebSocket | null = null;
  private lastSeq = -1;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private readonly runId: string,
    private readonly handlers: RunEventSocketHandlers,
  ) {
    this.connect();
  }

  private connect(): void {
    this.handlers.onStatusChange?.(this.lastSeq === -1 ? "connecting" : "reconnecting");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    this.ws = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "subscribe", runId: this.runId, sinceSeq: this.lastSeq }));
      this.handlers.onStatusChange?.("open");
    });

    ws.addEventListener("message", (ev: MessageEvent<string>) => {
      const data = JSON.parse(ev.data) as RuntimeEvent | { type: "error"; message: string };
      if (!("seq" in data)) return; // a protocol-level frame (malformed subscribe, etc.), not a run event
      if (data.seq <= this.lastSeq) return; // dedup safety net for an overlapping replay
      this.lastSeq = data.seq;
      this.handlers.onEvent(data);
    });

    ws.addEventListener("close", () => {
      if (this.closed) return;
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.connect();
    }, RECONNECT_DELAY_MS);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
