import type { RuntimeEvent, SerializedError, Usage } from "@ao/shared";

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  usage?: Usage;
}

export interface PostMessageResult {
  runId: string;
  userMessage: ChatMessage;
}

export interface KeyStatus {
  hasKey: boolean;
  backend: "os-keyring" | "encrypted-file" | null;
  maskedKey: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly serialized?: SerializedError,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let serialized: SerializedError | undefined;
    try {
      serialized = (await res.json()) as SerializedError;
    } catch {
      // Body wasn't JSON — fall through with no serialized detail.
    }
    throw new ApiError(
      serialized?.message ?? `request to ${path} failed with ${String(res.status)}`,
      res.status,
      serialized,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ status: string; provider: string; model: string }>("/api/health"),

  listThreads: () => request<Thread[]>("/api/threads"),
  createThread: (title?: string) =>
    request<Thread>("/api/threads", { method: "POST", body: JSON.stringify({ title }) }),
  listMessages: (threadId: string) => request<ChatMessage[]>(`/api/threads/${threadId}/messages`),
  postMessage: (threadId: string, content: string) =>
    request<PostMessageResult>(`/api/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  eventsSince: (runId: string, sinceSeq: number) =>
    request<RuntimeEvent[]>(`/api/runs/${runId}/events?sinceSeq=${String(sinceSeq)}`),

  keyStatus: () => request<KeyStatus>("/api/keys/status"),
  setKey: (apiKey: string) =>
    request<KeyStatus>("/api/keys", { method: "POST", body: JSON.stringify({ apiKey }) }),
  deleteKey: () => request<KeyStatus>("/api/keys", { method: "DELETE" }),
};
