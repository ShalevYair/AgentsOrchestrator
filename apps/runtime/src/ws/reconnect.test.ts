import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import type {
  CacheableContent,
  CacheRef,
  CountRequest,
  Delta,
  GenerateRequest,
  LLMProvider,
  ModelInfo,
  RedactionEvent,
} from "@ao/shared";
import { buildServer } from "../server.js";
import { buildTestContext, type TestContext } from "../test-support/build-test-context.js";

/**
 * Yields one chunk every `delayMs` — real (if short) async delays, standing
 * in for "server-side delays" so a test client can genuinely disconnect
 * and reconnect mid-run rather than the whole turn completing synchronously
 * before the WS layer gets a chance to matter (P2-T6's acceptance test).
 */
class DelayedProvider implements LLMProvider {
  constructor(
    private readonly chunks: string[],
    private readonly delayMs: number,
  ) {}

  countTokens(_req: CountRequest): Promise<number> {
    return Promise.resolve(10);
  }

  async *generate(_req: GenerateRequest): AsyncIterable<Delta> {
    for (let i = 0; i < this.chunks.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      const isLast = i === this.chunks.length - 1;
      const delta: Delta = { text: this.chunks[i] ?? "", isThought: false };
      if (isLast) {
        delta.finishReason = "stop";
        delta.usage = { promptTokens: 5, candidatesTokens: 10, thoughtsTokens: 0, cachedTokens: 0 };
      }
      yield delta;
    }
  }

  cacheCreate(content: CacheableContent): Promise<CacheRef> {
    return Promise.resolve({ name: "cache", model: content.model, expiresAt: new Date().toISOString() });
  }

  models(): Promise<ModelInfo[]> {
    return Promise.resolve([
      {
        id: "gemini-3.7-flash",
        displayName: "test",
        contextWindowTokens: 1000,
        maxOutputTokens: 100,
        supportsGenerate: true,
        supportsCountTokens: true,
        supportsCaching: false,
        supportsThinking: false,
      },
    ]);
  }

  getEgressRedactions(): readonly RedactionEvent[] {
    return [];
  }
}

interface WireEvent {
  type: string;
  runId: string;
  seq: number;
  payload: unknown;
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
    ws.once("open", () => {
      resolve(ws);
    });
    ws.once("error", reject);
  });
}

async function waitForCount(events: WireEvent[], count: number, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (events.length < count) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${String(count)} events, got ${String(events.length)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

let dir: string;
let ctx: TestContext;
let app: FastifyInstance;
let port: number;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "ao-reconnect-"));
  ctx = buildTestContext(join(dir, "ao.sqlite3"));
  ctx.provider = new DelayedProvider(["one ", "two ", "three ", "four ", "five ", "six "], 30);
  app = await buildServer(ctx);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("expected a bound TCP address");
  port = address.port;
});

afterEach(async () => {
  await app.close();
  ctx.driver.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("WS reconnect gap-filling (P2-T6)", () => {
  it("a disconnect mid-run followed by a reconnect with the last-seen seq loses nothing and duplicates nothing", async () => {
    const createRes = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = createRes.json<{ id: string }>();
    const postRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: { content: "go" },
    });
    const { runId } = postRes.json<{ runId: string }>();

    const firstConnEvents: WireEvent[] = [];
    const first = await connect(port);
    first.on("message", (raw: Buffer) => {
      firstConnEvents.push(JSON.parse(raw.toString("utf8")) as WireEvent);
    });
    first.send(JSON.stringify({ type: "subscribe", runId, sinceSeq: -1 }));

    // Let a few events (run.started, task.started, a couple of deltas)
    // arrive, then simulate a hard disconnect — no clean WS close frame.
    await waitForCount(firstConnEvents, 3);
    first.terminate();
    // Give the server's "close" handler a turn to unsubscribe.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const lastSeenSeq = firstConnEvents.at(-1)?.seq ?? -1;

    // The run keeps emitting events (persisted, just with nobody live to
    // push them to) while "disconnected" — the real-world 30s gap.
    await new Promise((resolve) => setTimeout(resolve, 120));

    const secondConnEvents: WireEvent[] = [];
    const second = await connect(port);
    second.on("message", (raw: Buffer) => {
      secondConnEvents.push(JSON.parse(raw.toString("utf8")) as WireEvent);
    });
    second.send(JSON.stringify({ type: "subscribe", runId, sinceSeq: lastSeenSeq }));

    const runFinishStart = Date.now();
    while (!secondConnEvents.some((e) => e.type === "run.finished")) {
      if (Date.now() - runFinishStart > 5000) throw new Error("run.finished never arrived on reconnect");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    second.close();
    first.close();

    const canonicalRes = await app.inject({ method: "GET", url: `/api/runs/${runId}/events` });
    const canonical = canonicalRes.json<WireEvent[]>();

    const replayed = [...firstConnEvents, ...secondConnEvents];
    const replayedSeqs = replayed.map((e) => e.seq);
    const canonicalSeqs = canonical.map((e) => e.seq);

    // No duplicates.
    expect(new Set(replayedSeqs).size).toBe(replayedSeqs.length);
    // No gaps, and nothing extra: the client ends up with exactly the same
    // set of events (by seq) as the durable, canonical event log.
    expect([...replayedSeqs].sort((a, b) => a - b)).toEqual(canonicalSeqs);
    // And in the order each connection received them, seq is strictly increasing.
    expect(firstConnEvents.map((e) => e.seq)).toEqual(
      [...firstConnEvents.map((e) => e.seq)].sort((a, b) => a - b),
    );
    expect(secondConnEvents.map((e) => e.seq)).toEqual(
      [...secondConnEvents.map((e) => e.seq)].sort((a, b) => a - b),
    );
    expect(canonical.at(0)?.type).toBe("run.started");
    expect(canonical.at(-1)?.type).toBe("run.finished");
  });
});
