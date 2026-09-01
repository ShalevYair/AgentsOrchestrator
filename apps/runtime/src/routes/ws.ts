import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

interface SubscribeMessage {
  type: "subscribe";
  runId: string;
  /** Last seq this client already has for `runId`; -1 (or omitted) means "send everything". */
  sinceSeq?: number;
}

function isSubscribeMessage(value: unknown): value is SubscribeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "subscribe" &&
    typeof (value as { runId?: unknown }).runId === "string"
  );
}

/**
 * P2-T6 wire protocol: a client opens `/ws` once and sends one
 * `{type:"subscribe", runId, sinceSeq}` per run it wants to follow
 * (including on every reconnect, with whatever `sinceSeq` it last saw) —
 * see ws/hub.ts for how that guarantees no gap and no duplicate.
 */
export function registerWsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/ws", { websocket: true }, (socket) => {
    socket.on("message", (raw: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
        return;
      }
      if (!isSubscribeMessage(parsed)) {
        socket.send(
          JSON.stringify({ type: "error", message: "expected {type:'subscribe', runId, sinceSeq?}" }),
        );
        return;
      }
      ctx.hub.subscribe(socket, parsed.runId, parsed.sinceSeq ?? -1);
    });

    socket.on("close", () => {
      ctx.hub.unsubscribe(socket);
    });
  });
}
