import type { Usage } from "@ao/shared";
import type { SqlDriver } from "./driver.js";
import { genMessageId } from "./ids.js";

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  usage?: Usage;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  usage_json: string | null;
}

function fromRow(row: MessageRow): ChatMessage {
  const message: ChatMessage = {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
  if (row.usage_json !== null) {
    message.usage = JSON.parse(row.usage_json) as Usage;
  }
  return message;
}

export interface InsertMessageInput {
  threadId: string;
  role: MessageRole;
  content: string;
  usage?: Usage;
}

export function insertMessage(driver: SqlDriver, input: InsertMessageInput): ChatMessage {
  const message: ChatMessage = {
    id: genMessageId(),
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    createdAt: new Date().toISOString(),
  };
  if (input.usage !== undefined) {
    message.usage = input.usage;
  }
  driver.run(
    "INSERT INTO messages (id, thread_id, role, content, created_at, usage_json) VALUES (?, ?, ?, ?, ?, ?)",
    [
      message.id,
      message.threadId,
      message.role,
      message.content,
      message.createdAt,
      message.usage !== undefined ? JSON.stringify(message.usage) : null,
    ],
  );
  return message;
}

export function listMessages(driver: SqlDriver, threadId: string): ChatMessage[] {
  return driver
    .all<MessageRow>(
      "SELECT id, thread_id, role, content, created_at, usage_json FROM messages WHERE thread_id = ? ORDER BY created_at ASC, rowid ASC",
      [threadId],
    )
    .map(fromRow);
}
