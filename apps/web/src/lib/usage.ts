import type { ChatMessage } from "./api.js";

/**
 * "Cost so far" for the token counter chip (P2-T8) — mirrors
 * apps/runtime/src/chat/run-chat.ts's `sumUsage` exactly: prompt +
 * candidates + thoughts tokens across the thread's assistant messages.
 * `cachedTokens` is excluded (it's a discount on prompt cost, not
 * additional spend).
 */
export function sumThreadTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    if (message.usage) {
      total += message.usage.promptTokens + message.usage.candidatesTokens + message.usage.thoughtsTokens;
    }
  }
  return total;
}
