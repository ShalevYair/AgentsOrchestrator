import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type SqlDriver } from "./driver.js";
import { applyMigrations } from "./migrations.js";
import { createThread } from "./threads.repo.js";
import { insertMessage, listMessages } from "./messages.repo.js";

let dir: string;
let driver: SqlDriver;
let threadId: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-messages-"));
  driver = openDatabase(join(dir, "ao.sqlite3"));
  applyMigrations(driver);
  threadId = createThread(driver, "t").id;
});

afterEach(() => {
  driver.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("messages.repo", () => {
  it("round-trips a user message with no usage", () => {
    const message = insertMessage(driver, { threadId, role: "user", content: "hi" });
    const [found] = listMessages(driver, threadId);
    expect(found).toEqual(message);
    expect(found?.usage).toBeUndefined();
  });

  it("round-trips an assistant message with usage_json", () => {
    const usage = { promptTokens: 10, candidatesTokens: 20, thoughtsTokens: 0, cachedTokens: 0 };
    insertMessage(driver, { threadId, role: "assistant", content: "hello there", usage });
    const [found] = listMessages(driver, threadId);
    expect(found?.usage).toEqual(usage);
  });

  it("preserves insertion order across many messages", () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(driver, {
        threadId,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `msg-${String(i)}`,
      });
    }
    const messages = listMessages(driver, threadId);
    expect(messages.map((m) => m.content)).toEqual(["msg-0", "msg-1", "msg-2", "msg-3", "msg-4"]);
  });
});
