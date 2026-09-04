import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import { MockLLMProvider } from "@ao/providers";
import { BudgetExceededError, type GoalConfig, type RedactionEvent } from "@ao/shared";
import { openDatabase, type SqlDriver } from "../db/driver.js";
import { listEventsSince } from "../db/events.repo.js";
import { insertMessage, listMessages } from "../db/messages.repo.js";
import { applyMigrations } from "../db/migrations.js";
import { createThread } from "../db/threads.repo.js";
import { EventHub } from "../ws/hub.js";
import { runChatTurn } from "./run-chat.js";
import { RunRegistry } from "./run-registry.js";

let dir: string;
let driver: SqlDriver;
let hub: EventHub;
let provider: MockLLMProvider;
let runRegistry: RunRegistry;

const MODEL = "gemini-3.7-flash";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-run-chat-"));
  driver = openDatabase(join(dir, "ao.sqlite3"));
  applyMigrations(driver);
  hub = new EventHub(driver);
  provider = new MockLLMProvider({ responses: [{ text: "hi back", chunkCount: 2 }] });
  runRegistry = new RunRegistry();
});

afterEach(() => {
  driver.close();
  rmSync(dir, { recursive: true, force: true });
});

function goalConfig(overrides: Partial<GoalConfig>): GoalConfig {
  return { ...DEFAULT_GOAL_CONFIG, ...overrides };
}

describe("runChatTurn budget wiring (P9-T1)", () => {
  it("uses DEFAULT_GOAL_CONFIG's budget/mode when none is supplied", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const { runId } = await runChatTurn({
      driver,
      hub,
      provider,
      runRegistry,
      model: MODEL,
      threadId: thread.id,
    });
    const events = listEventsSince(driver, runId, -1);
    expect(events[0]).toMatchObject({
      type: "run.started",
      payload: { budget: DEFAULT_GOAL_CONFIG.budgetTotal, mode: "standard" },
    });
  });

  it("passes effort through as the real generate() thinkingLevel", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    await runChatTurn({
      driver,
      hub,
      provider,
      runRegistry,
      model: MODEL,
      threadId: thread.id,
      goalConfig: goalConfig({ effort: "high" }),
    });
    expect(provider.calls.generate).toHaveLength(1);
    expect(provider.calls.generate[0]?.thinkingLevel).toBe("high");
  });

  it("hard-stop rejects a call the budget can't cover, without ever reaching the provider", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const tiny = goalConfig({ budgetTotal: 10, overrunPolicy: "hard-stop" });

    await expect(
      runChatTurn({
        driver,
        hub,
        provider,
        runRegistry,
        model: MODEL,
        threadId: thread.id,
        goalConfig: tiny,
      }),
    ).rejects.toThrow(BudgetExceededError);

    expect(provider.calls.generate).toHaveLength(0);
    // No assistant reply — the turn never produced one.
    expect(listMessages(driver, thread.id)).toHaveLength(1);
  });

  it("ask also rejects without calling the provider (no mid-turn ask UI yet)", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const tiny = goalConfig({ budgetTotal: 10, overrunPolicy: "ask" });

    await expect(
      runChatTurn({
        driver,
        hub,
        provider,
        runRegistry,
        model: MODEL,
        threadId: thread.id,
        goalConfig: tiny,
      }),
    ).rejects.toThrow(BudgetExceededError);
    expect(provider.calls.generate).toHaveLength(0);
  });

  it("hard-stop publishes error + a failed run.finished carrying a real ledger snapshot", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const tiny = goalConfig({ budgetTotal: 10, overrunPolicy: "hard-stop" });
    const runId = "run_hardstoptest";

    await expect(
      runChatTurn({
        driver,
        hub,
        provider,
        runRegistry,
        model: MODEL,
        threadId: thread.id,
        goalConfig: tiny,
        runId,
      }),
    ).rejects.toThrow(BudgetExceededError);

    const types = listEventsSince(driver, runId, -1).map((e) => e.type);
    expect(types).toContain("error");
    const finished = listEventsSince(driver, runId, -1).find((e) => e.type === "run.finished");
    expect(finished).toMatchObject({ payload: { status: "failed" } });
    expect((finished?.payload as { ledger: unknown }).ledger).toBeTruthy();
  });

  it("degrade draws from reserve and still completes when plain admission can't cover it", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    // admit() rejects when worstCase > ledger.available (total minus
    // reserve, whole-run — not the execution bucket's own 58% share). A
    // worst case of ~64K (gemini-3.7-flash's maxOutputTokens) can never fit
    // under a 5,000-token budget's ~4,400 available, so this deterministically
    // forces the reserve-draw path.
    const tiny = goalConfig({ budgetTotal: 5_000, overrunPolicy: "degrade" });

    const { runId, assistantMessage } = await runChatTurn({
      driver,
      hub,
      provider,
      runRegistry,
      model: MODEL,
      threadId: thread.id,
      goalConfig: tiny,
    });

    expect(provider.calls.generate).toHaveLength(1);
    expect(assistantMessage?.content).toBe("hi back");
    const events = listEventsSince(driver, runId, -1);
    const finished = events.find((e) => e.type === "run.finished");
    expect(finished).toMatchObject({ payload: { status: "completed" } });

    // BUDGET.md §8 / P9-T6: the reserve draw itself is real and must be
    // visible on the wire (not just inferred from the run completing).
    // `clamped: true` here is real, not a guess — this budget is so tiny
    // that even the reserve itself can't cover the full worst-case draw.
    const degraded = events.find((e) => e.type === "budget.degraded");
    expect(degraded).toMatchObject({
      payload: { stageId: "chat", agentType: "chat", clamped: true },
    });
    const degradedPayload = degraded?.payload as { amount: number };
    expect(degradedPayload.amount).toBeGreaterThan(0);
  });

  it("a comfortable standard budget is approved through plain admission, no degradation needed", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const { runId } = await runChatTurn({
      driver,
      hub,
      provider,
      runRegistry,
      model: MODEL,
      threadId: thread.id,
      goalConfig: DEFAULT_GOAL_CONFIG,
    });
    const ledgerUpdated = listEventsSince(driver, runId, -1).find((e) => e.type === "ledger.updated");
    expect(ledgerUpdated).toBeTruthy();
    const payload = ledgerUpdated?.payload as { spent: number; remaining: number };
    expect(payload.spent).toBeGreaterThan(0);
    expect(payload.remaining).toBeLessThan(DEFAULT_GOAL_CONFIG.budgetTotal);
  });
});

describe("runChatTurn egress wiring (P9-T7)", () => {
  it("publishes egress.recorded with a real byte count and no artifacts on the chat-only path", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hello there" });
    const { runId } = await runChatTurn({
      driver,
      hub,
      provider,
      runRegistry,
      model: MODEL,
      threadId: thread.id,
    });

    const recorded = listEventsSince(driver, runId, -1).find((e) => e.type === "egress.recorded");
    expect(recorded).toBeTruthy();
    const payload = recorded?.payload as {
      callId: string;
      bytes: number;
      artifactRefs: string[];
      redactions: number;
    };
    expect(payload.bytes).toBeGreaterThan(0);
    expect(payload.artifactRefs).toEqual([]);
    expect(payload.redactions).toBe(0); // MockLLMProvider never redacts anything
  });

  it("reports only this call's redactions, not the provider's whole-lifetime total", async () => {
    // A provider whose getEgressRedactions() already carries redactions
    // from *earlier* calls, plus one more made *during* this generate() —
    // proves the delta math (this call's count only), not the raw
    // cumulative log Ledger.drawFromReserve-style bugs could re-introduce.
    class PreRedactedProvider extends MockLLMProvider {
      private readonly log: RedactionEvent[] = [
        { path: "", pattern: "from-an-earlier-call" },
        { path: "", pattern: "from-an-earlier-call" },
      ];
      override async *generate(req: Parameters<MockLLMProvider["generate"]>[0]) {
        this.log.push({ path: "/secret", pattern: "test-secret" });
        yield* super.generate(req);
      }
      override getEgressRedactions(): readonly RedactionEvent[] {
        return this.log;
      }
    }
    const preRedactedProvider = new PreRedactedProvider({ responses: [{ text: "hi back", chunkCount: 1 }] });

    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const { runId } = await runChatTurn({
      driver,
      hub,
      provider: preRedactedProvider,
      runRegistry,
      model: MODEL,
      threadId: thread.id,
    });

    const recorded = listEventsSince(driver, runId, -1).find((e) => e.type === "egress.recorded");
    const payload = recorded?.payload as { redactions: number };
    expect(payload.redactions).toBe(1); // not 3 (the pre-existing 2 + this call's 1)
  });
});

describe("runChatTurn stop wiring (P9-T11)", () => {
  /** Aborts `runId` from inside the stream itself, right after the first real chunk is yielded — deterministic (no real timers/wall-clock races): the abort call and run-chat.ts's per-delta abort check both happen on the same synchronous microtask chain. */
  class StoppableProvider extends MockLLMProvider {
    constructor(
      private readonly runIdToStop: string,
      private readonly registry: RunRegistry,
      options: ConstructorParameters<typeof MockLLMProvider>[0],
    ) {
      super(options);
    }
    override async *generate(req: Parameters<MockLLMProvider["generate"]>[0]) {
      let i = 0;
      for await (const delta of super.generate(req)) {
        i += 1;
        if (i === 1) this.registry.requestStop(this.runIdToStop);
        yield delta;
      }
    }
  }

  it("stopping mid-stream keeps the text streamed so far, releases the ledger, and finishes as 'stopped'", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const runId = "run_stopmidstream";
    const stoppable = new StoppableProvider(runId, runRegistry, {
      responses: [{ text: "hello there, this is a longer reply", chunkCount: 4 }],
    });

    const { assistantMessage } = await runChatTurn({
      driver,
      hub,
      provider: stoppable,
      runRegistry,
      model: MODEL,
      threadId: thread.id,
      runId,
    });

    // Only the first of 4 chunks was ever processed — real partial text, not the full reply.
    expect(assistantMessage?.content).toBeTruthy();
    expect(assistantMessage?.content.length ?? 0).toBeLessThan("hello there, this is a longer reply".length);
    expect(assistantMessage?.usage).toBeUndefined(); // no real terminal Usage exists for a cut-short stream

    const events = listEventsSince(driver, runId, -1).map((e) => e.type);
    expect(events).toContain("task.delta"); // at least the one real chunk
    expect(events).not.toContain("egress.recorded"); // that only publishes on a normal completion
    const finished = listEventsSince(driver, runId, -1).find((e) => e.type === "run.finished");
    expect(finished).toMatchObject({ payload: { status: "stopped" } });

    // The reservation was released, not settled — nothing recorded as spent for this turn.
    const ledgerPayload = (finished?.payload as { ledger: { tokens: { spent: number } } }).ledger;
    expect(ledgerPayload.tokens.spent).toBe(0);
  });

  it("stopping before any text streamed persists no assistant message at all", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const runId = "run_stopimmediate";
    const stoppable = new StoppableProvider(runId, runRegistry, {
      responses: [{ text: "", chunkCount: 1 }],
    });

    const { assistantMessage } = await runChatTurn({
      driver,
      hub,
      provider: stoppable,
      runRegistry,
      model: MODEL,
      threadId: thread.id,
      runId,
    });

    expect(assistantMessage).toBeNull();
    expect(listMessages(driver, thread.id)).toHaveLength(1); // only the user's own message
  });

  it("requestStop after the run already finished is a no-op — the registry entry is gone", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const runId = "run_alreadydone";

    await runChatTurn({ driver, hub, provider, runRegistry, model: MODEL, threadId: thread.id, runId });

    expect(runRegistry.requestStop(runId)).toBe(false);
  });
});

describe("runChatTurn fault injection (P11-T8)", () => {
  /**
   * Simulates a provider-side disconnect/exhausted-retry (a real Gemini
   * call would already have gone through `@ao/providers`'s own
   * `withRetry` — P1-T5 — before ever throwing; by the time an error
   * reaches `LLMProvider.generate()`'s caller, retries are exhausted).
   * `failAfterChunks: 0` means the stream never yields anything at all
   * (connection never opens); a positive count throws after that many
   * real chunks (connection drops mid-reply).
   */
  class FlakyProvider extends MockLLMProvider {
    constructor(
      private readonly failAfterChunks: number,
      options: ConstructorParameters<typeof MockLLMProvider>[0],
    ) {
      super(options);
    }
    override async *generate(req: Parameters<MockLLMProvider["generate"]>[0]) {
      let yielded = 0;
      for await (const delta of super.generate(req)) {
        if (yielded >= this.failAfterChunks) {
          throw new Error("simulated disconnect: ECONNRESET");
        }
        yielded += 1;
        yield delta;
      }
    }
  }

  it("a stream that never opens ends the run as 'failed' with a clear error, never hangs", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const runId = "run_disconnectimmediate";
    const flaky = new FlakyProvider(0, { responses: [{ text: "won't ever arrive", chunkCount: 3 }] });

    await expect(
      runChatTurn({ driver, hub, provider: flaky, runRegistry, model: MODEL, threadId: thread.id, runId }),
    ).rejects.toThrow("simulated disconnect");

    // No assistant message at all — only the user's own message is there.
    expect(listMessages(driver, thread.id)).toHaveLength(1);

    const types = listEventsSince(driver, runId, -1).map((e) => e.type);
    expect(types).toContain("error");
    const finished = listEventsSince(driver, runId, -1).find((e) => e.type === "run.finished");
    expect(finished).toMatchObject({ payload: { status: "failed" } });

    // The reservation was released, not settled — a disconnect never gets billed.
    const ledgerPayload = (finished?.payload as { ledger: { tokens: { spent: number; committed: number } } })
      .ledger;
    expect(ledgerPayload.tokens.spent).toBe(0);
    expect(ledgerPayload.tokens.committed).toBe(0);

    // The run registry never leaks the aborted entry — a later stop on the same id is a no-op.
    expect(runRegistry.requestStop(runId)).toBe(false);
  });

  it("a stream that drops mid-reply also ends as 'failed' — the partial text it already sent is not persisted", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const runId = "run_disconnectmidstream";
    const flaky = new FlakyProvider(1, {
      responses: [{ text: "hello there, this is a longer reply", chunkCount: 4 }],
    });

    await expect(
      runChatTurn({ driver, hub, provider: flaky, runRegistry, model: MODEL, threadId: thread.id, runId }),
    ).rejects.toThrow("simulated disconnect: ECONNRESET");

    // One real chunk was streamed to any connected WS client (task.delta below), but — unlike a
    // user-initiated stop (P9-T11), which persists whatever text arrived — a genuine mid-stream
    // failure discards it: run-chat.ts's catch block never calls insertMessage. This asymmetry is
    // a real, verified behavior, not a defect to fix in this task (see docs/TASKS.md P11-T8).
    expect(listMessages(driver, thread.id)).toHaveLength(1);

    const types = listEventsSince(driver, runId, -1).map((e) => e.type);
    expect(types).toContain("task.delta"); // the one chunk that did arrive before the throw
    expect(types).toContain("error");
    const finished = listEventsSince(driver, runId, -1).find((e) => e.type === "run.finished");
    expect(finished).toMatchObject({ payload: { status: "failed" } });
  });

  it("a failed run does not block the next run on the same thread from completing normally", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const flaky = new FlakyProvider(0, { responses: [{ text: "unreachable", chunkCount: 1 }] });

    await expect(
      runChatTurn({ driver, hub, provider: flaky, runRegistry, model: MODEL, threadId: thread.id }),
    ).rejects.toThrow();

    insertMessage(driver, { threadId: thread.id, role: "user", content: "again?" });
    const { assistantMessage } = await runChatTurn({
      driver,
      hub,
      provider, // the healthy MockLLMProvider from beforeEach
      runRegistry,
      model: MODEL,
      threadId: thread.id,
    });

    expect(assistantMessage?.content).toBe("hi back");
  });
});
