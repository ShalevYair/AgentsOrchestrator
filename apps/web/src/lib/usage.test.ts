import { describe, expect, it } from "vitest";
import type { Usage } from "@ao/shared";
import type { ChatMessage } from "./api.js";
import { sumThreadTokens } from "./usage.js";

function assistantMessage(usage: Usage): ChatMessage {
  return { id: "m", threadId: "t", role: "assistant", content: "x", createdAt: "now", usage };
}

describe("sumThreadTokens", () => {
  it("sums prompt + candidates + thoughts across assistant messages, excluding cachedTokens", () => {
    const messages: ChatMessage[] = [
      assistantMessage({ promptTokens: 10, candidatesTokens: 20, thoughtsTokens: 5, cachedTokens: 100 }),
      assistantMessage({ promptTokens: 1, candidatesTokens: 2, thoughtsTokens: 0, cachedTokens: 0 }),
    ];
    expect(sumThreadTokens(messages)).toBe(10 + 20 + 5 + 1 + 2);
  });

  it("ignores messages with no usage (e.g. user messages)", () => {
    const messages: ChatMessage[] = [
      { id: "u", threadId: "t", role: "user", content: "hi", createdAt: "now" },
      assistantMessage({ promptTokens: 3, candidatesTokens: 4, thoughtsTokens: 0, cachedTokens: 0 }),
    ];
    expect(sumThreadTokens(messages)).toBe(7);
  });

  it("returns 0 for an empty thread", () => {
    expect(sumThreadTokens([])).toBe(0);
  });
});
