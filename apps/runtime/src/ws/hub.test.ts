import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { openDatabase, type SqlDriver } from "../db/driver.js";
import { applyMigrations } from "../db/migrations.js";
import { createThread } from "../db/threads.repo.js";
import { createRun } from "../db/runs.repo.js";
import { EventHub } from "./hub.js";

/** Minimal fake WebSocket — just enough of the `ws` surface EventHub touches. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState = 1;
  sent: { type: string }[] = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data) as { type: string });
  }
}

function fakeSocket(): { socket: WebSocket; fake: FakeSocket } {
  const fake = new FakeSocket();
  return { socket: fake as unknown as WebSocket, fake };
}

let dir: string;
let driver: SqlDriver;
let hub: EventHub;
let runId: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-hub-"));
  driver = openDatabase(join(dir, "ao.sqlite3"));
  applyMigrations(driver);
  hub = new EventHub(driver);
  const threadId = createThread(driver, "t").id;
  runId = createRun(driver, threadId).id;
});

afterEach(() => {
  driver.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("EventHub", () => {
  it("publish() persists and returns a schema-valid RuntimeEvent with an increasing seq", () => {
    const e0 = hub.publish(runId, "run.started", { runId, budget: 100, mode: "standard" });
    const e1 = hub.publish(runId, "task.started", {
      taskId: `${runId}#0`,
      agentType: "chat",
      shard: "default",
      contextTokens: 5,
    });
    expect(e0.seq).toBe(0);
    expect(e1.seq).toBe(1);
  });

  it("a subscriber connecting fresh replays full history from seq 0", () => {
    hub.publish(runId, "run.started", { runId, budget: 100, mode: "standard" });
    hub.publish(runId, "task.started", {
      taskId: "t",
      agentType: "chat",
      shard: "default",
      contextTokens: 1,
    });

    const { socket, fake } = fakeSocket();
    hub.subscribe(socket, runId, -1);
    expect(fake.sent).toHaveLength(2);
  });

  it("a subscriber given sinceSeq only gets what came after", () => {
    hub.publish(runId, "run.started", { runId, budget: 100, mode: "standard" });
    hub.publish(runId, "task.started", {
      taskId: "t",
      agentType: "chat",
      shard: "default",
      contextTokens: 1,
    });

    const { socket, fake } = fakeSocket();
    hub.subscribe(socket, runId, 0);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]?.type).toBe("task.started");
  });

  it("a live subscriber receives events published after it subscribed", () => {
    const { socket, fake } = fakeSocket();
    hub.subscribe(socket, runId, -1);
    hub.publish(runId, "run.started", { runId, budget: 100, mode: "standard" });
    expect(fake.sent).toHaveLength(1);
  });

  it("unsubscribe stops further delivery to that socket", () => {
    const { socket, fake } = fakeSocket();
    hub.subscribe(socket, runId, -1);
    hub.unsubscribe(socket);
    hub.publish(runId, "run.started", { runId, budget: 100, mode: "standard" });
    expect(fake.sent).toHaveLength(0);
  });

  it("does not broadcast events for a different run to an unrelated subscriber", () => {
    const threadId = createThread(driver, "t2").id;
    const otherRun = createRun(driver, threadId).id;
    const { socket, fake } = fakeSocket();
    hub.subscribe(socket, otherRun, -1);
    hub.publish(runId, "run.started", { runId, budget: 100, mode: "standard" });
    expect(fake.sent).toHaveLength(0);
  });
});
