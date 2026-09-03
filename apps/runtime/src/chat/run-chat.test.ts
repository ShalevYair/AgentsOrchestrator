import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GOAL_CONFIG } from "@ao/core/plan";
import { MockLLMProvider } from "@ao/providers";
import { BudgetExceededError, type GoalConfig } from "@ao/shared";
import { openDatabase, type SqlDriver } from "../db/driver.js";
import { listEventsSince } from "../db/events.repo.js";
import { insertMessage, listMessages } from "../db/messages.repo.js";
import { applyMigrations } from "../db/migrations.js";
import { createThread } from "../db/threads.repo.js";
import { EventHub } from "../ws/hub.js";
import { runChatTurn } from "./run-chat.js";

let dir: string;
let driver: SqlDriver;
let hub: EventHub;
let provider: MockLLMProvider;

const MODEL = "gemini-3.7-flash";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-run-chat-"));
  driver = openDatabase(join(dir, "ao.sqlite3"));
  applyMigrations(driver);
  hub = new EventHub(driver);
  provider = new MockLLMProvider({ responses: [{ text: "hi back", chunkCount: 2 }] });
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
    const { runId } = await runChatTurn({ driver, hub, provider, model: MODEL, threadId: thread.id });
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
      runChatTurn({ driver, hub, provider, model: MODEL, threadId: thread.id, goalConfig: tiny }),
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
      runChatTurn({ driver, hub, provider, model: MODEL, threadId: thread.id, goalConfig: tiny }),
    ).rejects.toThrow(BudgetExceededError);
    expect(provider.calls.generate).toHaveLength(0);
  });

  it("hard-stop publishes error + a failed run.finished carrying a real ledger snapshot", async () => {
    const thread = createThread(driver, "t");
    insertMessage(driver, { threadId: thread.id, role: "user", content: "hi" });
    const tiny = goalConfig({ budgetTotal: 10, overrunPolicy: "hard-stop" });
    const runId = "run_hardstoptest";

    await expect(
      runChatTurn({ driver, hub, provider, model: MODEL, threadId: thread.id, goalConfig: tiny, runId }),
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
      model: MODEL,
      threadId: thread.id,
      goalConfig: tiny,
    });

    expect(provider.calls.generate).toHaveLength(1);
    expect(assistantMessage.content).toBe("hi back");
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
