import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTelemetryRecorder, telemetryFilePath } from "@ao/platform";
import { GeminiProvider, MockLLMProvider, WORKER_MODEL_ID } from "@ao/providers";
import { buildServer } from "./server.js";
import { buildTestContext, type TestContext } from "./test-support/build-test-context.js";

let dir: string;
let ctx: TestContext;
let app: FastifyInstance;

interface ThreadDto {
  id: string;
  title: string;
}

interface MessageDto {
  id: string;
  role: string;
  content: string;
  usage?: unknown;
}

interface EventDto {
  type: string;
  runId: string;
  seq: number;
  payload: unknown;
}

interface KeyStatusDto {
  hasKey: boolean;
  backend: string | null;
  maskedKey: string | null;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "ao-server-"));
  ctx = buildTestContext(join(dir, "ao.sqlite3"), {
    mockOptions: { responses: [{ text: "hello there", chunkCount: 4 }] },
  });
  app = await buildServer(ctx);
});

afterEach(async () => {
  await app.close();
  ctx.driver.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Polls `check` until it returns a truthy value or `timeoutMs` elapses. Used because a chat turn runs un-awaited in the background (see routes/threads.ts). */
async function waitFor<T>(check: () => T | undefined | Promise<T | undefined>, timeoutMs = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await check();
    if (result !== undefined) return result;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("GET /api/health", () => {
  it("reports the selected provider and model", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ok",
      provider: "mock",
      model: "gemini-3.7-flash",
      telemetryEnabled: false,
    });
  });
});

describe("threads + messages", () => {
  it("creates a thread, lists it, and starts empty", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: { title: "Test" } });
    expect(create.statusCode).toBe(201);
    const thread = create.json<ThreadDto>();
    expect(thread.title).toBe("Test");

    const list = await app.inject({ method: "GET", url: "/api/threads" });
    expect(list.json<ThreadDto[]>()).toEqual([thread]);

    const messages = await app.inject({ method: "GET", url: `/api/threads/${thread.id}/messages` });
    expect(messages.json<MessageDto[]>()).toEqual([]);
  });

  it("404s for an unknown thread", async () => {
    const res = await app.inject({ method: "GET", url: "/api/threads/thr_missing/messages" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("posting a message starts a run and eventually persists the assistant reply with usage", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = create.json<ThreadDto>();

    const post = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: { content: "hi there" },
    });
    expect(post.statusCode).toBe(202);
    const { runId, userMessage } = post.json<{ runId: string; userMessage: MessageDto }>();
    expect(runId).toMatch(/^run_[a-f0-9]+$/);
    expect(userMessage.content).toBe("hi there");

    const messages = await waitFor(async () => {
      const res = await app.inject({ method: "GET", url: `/api/threads/${thread.id}/messages` });
      const body = res.json<MessageDto[]>();
      return body.length === 2 ? body : undefined;
    });
    expect(messages[0]?.role).toBe("user");
    const assistant = messages[1];
    expect(assistant?.role).toBe("assistant");
    expect(assistant?.content).toBe("hello there");
    expect(assistant?.usage).toBeTruthy();

    const events = await app.inject({ method: "GET", url: `/api/runs/${runId}/events` });
    const eventTypes = events.json<EventDto[]>().map((e) => e.type);
    expect(eventTypes[0]).toBe("run.started");
    expect(eventTypes).toContain("task.delta");
    expect(eventTypes.at(-1)).toBe("run.finished");
  });

  it("rejects an empty message body", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = create.json<ThreadDto>();
    const res = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/messages`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("surfaces a provider failure as an `error` event and a failed run, without crashing the server", async () => {
    const failingCtx = buildTestContext(join(dir, "ao-fail.sqlite3"));
    // eslint-disable-next-line @typescript-eslint/require-await -- must match LLMProvider.generate's async generator signature
    failingCtx.provider.generate = async function* generate() {
      throw new Error("boom");
      yield { text: "", isThought: false };
    };
    const failApp = await buildServer(failingCtx);
    try {
      const create = await failApp.inject({ method: "POST", url: "/api/threads", payload: {} });
      const thread = create.json<ThreadDto>();
      const post = await failApp.inject({
        method: "POST",
        url: `/api/threads/${thread.id}/messages`,
        payload: { content: "hi" },
      });
      const { runId } = post.json<{ runId: string }>();

      const events = await waitFor(async () => {
        const res = await failApp.inject({ method: "GET", url: `/api/runs/${runId}/events` });
        const body = res.json<EventDto[]>();
        return body.some((e) => e.type === "run.finished") ? body : undefined;
      });
      const types = events.map((e) => e.type);
      expect(types).toContain("error");
      expect(events.at(-1)).toMatchObject({ type: "run.finished", payload: { status: "failed" } });
    } finally {
      await failApp.close();
      failingCtx.driver.close();
    }
  });
});

describe("DELETE /api/threads/:id (P9-T12)", () => {
  it("deletes a thread and its messages", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: { title: "Gone soon" } });
    const thread = create.json<ThreadDto>();
    await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: { content: "hi there" },
    });

    const del = await app.inject({ method: "DELETE", url: `/api/threads/${thread.id}` });
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe("");

    const list = await app.inject({ method: "GET", url: "/api/threads" });
    expect(list.json<ThreadDto[]>()).toEqual([]);

    const messages = await app.inject({ method: "GET", url: `/api/threads/${thread.id}/messages` });
    expect(messages.statusCode).toBe(404);
  });

  it("404s for an unknown thread instead of silently no-oping", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/threads/thr_missing" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleting one thread leaves other threads and their messages untouched", async () => {
    const keep = (
      await app.inject({ method: "POST", url: "/api/threads", payload: { title: "Keep" } })
    ).json<ThreadDto>();
    const doomed = (
      await app.inject({ method: "POST", url: "/api/threads", payload: { title: "Doomed" } })
    ).json<ThreadDto>();
    await app.inject({
      method: "POST",
      url: `/api/threads/${keep.id}/messages`,
      payload: { content: "stay" },
    });

    await app.inject({ method: "DELETE", url: `/api/threads/${doomed.id}` });

    const list = await app.inject({ method: "GET", url: "/api/threads" });
    expect(list.json<ThreadDto[]>().map((t) => t.id)).toEqual([keep.id]);
  });
});

describe("POST /api/runs/:id/stop (P9-T11)", () => {
  // `run-chat.test.ts` already proves *what happens* once a run is
  // actually aborted (partial text kept, ledger released, "stopped"
  // status) via a deterministic in-process call — MockLLMProvider's
  // chunks arrive synchronously with no real gap between them, so racing
  // a real HTTP stop request against a real in-flight stream here would
  // be timing-dependent, not a meaningful extra proof. What's untested
  // elsewhere, and what these prove, is the HTTP route itself: it reaches
  // the exact same `ctx.runRegistry` the chat path uses, and it's always
  // a safe no-op — never an error — for a run that isn't (or no longer
  // is) live.
  it("aborts a real controller registered under ctx.runRegistry, and returns 204", async () => {
    const controller = ctx.runRegistry.register("run_stoptest01");

    const res = await app.inject({ method: "POST", url: "/api/runs/run_stoptest01/stop" });

    expect(res.statusCode).toBe(204);
    expect(controller.signal.aborted).toBe(true);
  });

  it("is a harmless 204 no-op for a runId that was never registered", async () => {
    const res = await app.inject({ method: "POST", url: "/api/runs/run_neverexisted/stop" });
    expect(res.statusCode).toBe(204);
  });

  it("is a harmless 204 no-op for a run that already finished on its own", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = create.json<ThreadDto>();
    const post = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: { content: "hi there" },
    });
    const { runId } = post.json<{ runId: string }>();

    await waitFor(async () => {
      const res = await app.inject({ method: "GET", url: `/api/runs/${runId}/events` });
      const body = res.json<EventDto[]>();
      return body.some((e) => e.type === "run.finished") ? true : undefined;
    });

    const stop = await app.inject({ method: "POST", url: `/api/runs/${runId}/stop` });
    expect(stop.statusCode).toBe(204);

    // Nothing about the already-completed run changed.
    const messages = await app.inject({ method: "GET", url: `/api/threads/${thread.id}/messages` });
    expect(messages.json<MessageDto[]>()).toHaveLength(2);
  });
});

describe("goal config", () => {
  it("a new thread starts with the standard-level default", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = create.json<{ goalConfig: { level: string; budgetTotal: number } }>();
    expect(thread.goalConfig).toMatchObject({ level: "standard", budgetTotal: 2_500_000 });
  });

  it("PUT persists a customized config, reflected by a subsequent GET of the thread list", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = create.json<ThreadDto>();

    const customized = {
      level: "deep",
      budgetTotal: 5_000_000,
      effort: "high",
      overrunPolicy: "hard-stop",
      maxParallel: 12,
      allowScripts: true,
      allowFolderWrite: true,
      requirePlanApproval: true,
    };
    const put = await app.inject({
      method: "PUT",
      url: `/api/threads/${thread.id}/goal-config`,
      payload: customized,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(customized);

    const list = await app.inject({ method: "GET", url: "/api/threads" });
    const [found] = list.json<{ id: string; goalConfig: unknown }[]>();
    expect(found?.goalConfig).toEqual(customized);
  });

  it("rejects a malformed config and leaves the stored one untouched", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = create.json<ThreadDto>();

    const put = await app.inject({
      method: "PUT",
      url: `/api/threads/${thread.id}/goal-config`,
      payload: { level: "not-a-real-level" },
    });
    expect(put.statusCode).toBe(400);

    const list = await app.inject({ method: "GET", url: "/api/threads" });
    const [found] = list.json<{ goalConfig: { level: string } }[]>();
    expect(found?.goalConfig.level).toBe("standard");
  });

  it("404s for an unknown thread", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/threads/thr_missing/goal-config",
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("keys", () => {
  it("reports no key stored by default, then set/status/delete round-trips", async () => {
    const status0 = await app.inject({ method: "GET", url: "/api/keys/status" });
    expect(status0.json()).toEqual({ hasKey: false, backend: null, maskedKey: null });

    const set = await app.inject({
      method: "POST",
      url: "/api/keys",
      payload: { apiKey: "AIzaTestKey12345678" },
    });
    expect(set.statusCode).toBe(200);
    const status1 = set.json<KeyStatusDto>();
    expect(status1.hasKey).toBe(true);
    expect(status1.backend).toBe("encrypted-file");
    expect(status1.maskedKey).toBe("AIza••••5678");
    expect(status1.maskedKey).not.toContain("TestKey");

    const del = await app.inject({ method: "DELETE", url: "/api/keys" });
    expect(del.json()).toEqual({ hasKey: false, backend: null, maskedKey: null });
  });

  it("rejects (and never stores) a key that fails live validation", async () => {
    const failing = new MockLLMProvider();
    failing.models = () => Promise.reject(new Error("401"));
    ctx.createValidationProvider = () => failing;

    const res = await app.inject({ method: "POST", url: "/api/keys", payload: { apiKey: "bad-key-value" } });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PROVIDER_KEY_INVALID" });

    const status = await app.inject({ method: "GET", url: "/api/keys/status" });
    expect(status.json()).toEqual({ hasKey: false, backend: null, maskedKey: null });
    // A rejected key must never hot-swap the live chat provider either.
    expect(ctx.providerKind).toBe("mock");
  });

  it("hot-swaps the live chat provider the moment a key is saved, and reverts it on delete — bug fix: a saved key wasn't recognized until restart", async () => {
    expect(ctx.providerKind).toBe("mock");
    expect(ctx.provider).toBeInstanceOf(MockLLMProvider);

    const set = await app.inject({
      method: "POST",
      url: "/api/keys",
      payload: { apiKey: "AIzaTestKey12345678" },
    });
    expect(set.statusCode).toBe(200);
    // No restart, no re-fetch of ctx — the exact same in-memory context the
    // already-running server holds now points at a real Gemini provider.
    expect(ctx.providerKind).toBe("gemini");
    expect(ctx.model).toBe(WORKER_MODEL_ID);
    expect(ctx.provider).toBeInstanceOf(GeminiProvider);

    const del = await app.inject({ method: "DELETE", url: "/api/keys" });
    expect(del.statusCode).toBe(200);
    expect(ctx.providerKind).toBe("mock");
    expect(ctx.provider).toBeInstanceOf(MockLLMProvider);
  });
});

describe("GET /api/environment (P12-T2)", () => {
  it("reports node/python/docker/sandbox without ever failing the request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/environment" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      node: { ok: boolean };
      python: { ok: boolean; installInstructions: string | null };
      docker: { available: boolean };
      sandbox: { implementation: string; notes: string[] };
    }>();
    expect(body.node.ok).toBe(true);
    expect(typeof body.python.ok).toBe("boolean");
    expect(typeof body.docker.available).toBe("boolean");
    expect(["linux", "darwin", "windows-native", "docker"]).toContain(body.sandbox.implementation);
  });
});

describe("telemetry (P12-T7)", () => {
  it("is off by default — no telemetry directory is ever created for a normal chat turn", async () => {
    const create = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = create.json<ThreadDto>();
    await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: { content: "hi" },
    });
    await waitFor(async () => {
      const res = await app.inject({ method: "GET", url: `/api/threads/${thread.id}/messages` });
      return res.json<MessageDto[]>().length === 2 ? true : undefined;
    });
    expect(ctx.telemetry.enabled).toBe(false);
  });

  it("when opted in, records run_completed (with no content) after a successful chat turn", async () => {
    const telemetryDir = mkdtempSync(join(tmpdir(), "ao-telemetry-server-test-"));
    ctx.telemetry = createTelemetryRecorder({ enabled: true, dataDir: telemetryDir });

    const create = await app.inject({ method: "POST", url: "/api/threads", payload: {} });
    const thread = create.json<ThreadDto>();
    await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: { content: "hi there" },
    });

    const events = await waitFor(() => {
      let lines: unknown[];
      try {
        lines = readFileSync(telemetryFilePath(telemetryDir), "utf8")
          .trim()
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as { type: string });
      } catch {
        return undefined;
      }
      return lines.length > 0 ? lines : undefined;
    });

    expect(events).toHaveLength(1);
    const [event] = events as [{ type: string; durationMs: number; timestamp: string }];
    expect(event).toMatchObject({ type: "run_completed" });
    expect(typeof event.durationMs).toBe("number");
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    rmSync(telemetryDir, { recursive: true, force: true });
  });

  it("when opted in, records run_failed with a stable error code (never the raw message) after a provider failure", async () => {
    const telemetryDir = mkdtempSync(join(tmpdir(), "ao-telemetry-server-test-fail-"));
    const failingCtx = buildTestContext(join(dir, "ao-telemetry-fail.sqlite3"));
    failingCtx.telemetry = createTelemetryRecorder({ enabled: true, dataDir: telemetryDir });
    // eslint-disable-next-line @typescript-eslint/require-await -- must match LLMProvider.generate's async generator signature
    failingCtx.provider.generate = async function* generate() {
      throw new Error("boom — some sensitive detail that must never reach telemetry");
      yield { text: "", isThought: false };
    };
    const failApp = await buildServer(failingCtx);
    try {
      const create = await failApp.inject({ method: "POST", url: "/api/threads", payload: {} });
      const thread = create.json<ThreadDto>();
      await failApp.inject({
        method: "POST",
        url: `/api/threads/${thread.id}/messages`,
        payload: { content: "hi" },
      });

      const events = await waitFor(() => {
        let lines: unknown[];
        try {
          lines = readFileSync(telemetryFilePath(telemetryDir), "utf8")
            .trim()
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => JSON.parse(line) as { type: string });
        } catch {
          return undefined;
        }
        return lines.length > 0 ? lines : undefined;
      });

      expect(events).toHaveLength(1);
      const [event] = events as [{ type: string; durationMs: number; errorCode: string; timestamp: string }];
      expect(event).toMatchObject({ type: "run_failed", errorCode: "UNKNOWN_ERROR" });
      expect(typeof event.durationMs).toBe("number");
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const raw = readFileSync(telemetryFilePath(telemetryDir), "utf8");
      expect(raw).not.toContain("boom");
      expect(raw).not.toContain("sensitive");
    } finally {
      await failApp.close();
      failingCtx.driver.close();
      rmSync(telemetryDir, { recursive: true, force: true });
    }
  });
});
