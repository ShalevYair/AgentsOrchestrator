import type { GoalConfig, RuntimeEvent, SerializedError, Usage } from "@ao/shared";

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  goalConfig: GoalConfig;
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

/** P12-T2 — mirrors `packages/tools/src/env-check/types.ts`'s `EnvironmentReport`. */
export interface EnvironmentReport {
  node: { version: string; ok: boolean };
  python: { available: boolean; version: string | null; ok: boolean; installInstructions: string | null };
  docker: { available: boolean };
  sandbox: {
    implementation: "linux" | "darwin" | "windows-native" | "docker";
    networkBlocking: boolean;
    memoryCpuCaps: "full" | "partial" | "none";
    notes: string[];
  };
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
  // Only set content-type when there's an actual body — Fastify's default
  // JSON parser (real bug, found via P9-T11's real-browser verification:
  // `curl` against the real runtime reproduces `FST_ERR_CTP_EMPTY_JSON_BODY`)
  // rejects a bodyless request that still carries this header, which
  // silently broke every no-body call (deleteKey, stopRun) — `.inject()`
  // in server.test.ts never caught it because Fastify's own test injector
  // doesn't reproduce this exact real-HTTP content-type check.
  const headers =
    init?.body !== undefined ? { "content-type": "application/json", ...init.headers } : init?.headers;
  const res = await fetch(path, { ...init, ...(headers !== undefined ? { headers } : {}) });
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
  health: () =>
    request<{ status: string; provider: string; model: string; telemetryEnabled: boolean }>("/api/health"),

  listThreads: () => request<Thread[]>("/api/threads"),
  createThread: (title?: string) =>
    request<Thread>("/api/threads", { method: "POST", body: JSON.stringify({ title }) }),
  listMessages: (threadId: string) => request<ChatMessage[]>(`/api/threads/${threadId}/messages`),
  /** P9-T12's history-panel delete — 204 on success, 404 for an unknown id (see routes/threads.ts). */
  deleteThread: (threadId: string) => request<void>(`/api/threads/${threadId}`, { method: "DELETE" }),
  setGoalConfig: (threadId: string, goalConfig: GoalConfig) =>
    request<GoalConfig>(`/api/threads/${threadId}/goal-config`, {
      method: "PUT",
      body: JSON.stringify(goalConfig),
    }),
  postMessage: (threadId: string, content: string) =>
    request<PostMessageResult>(`/api/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  eventsSince: (runId: string, sinceSeq: number) =>
    request<RuntimeEvent[]>(`/api/runs/${runId}/events?sinceSeq=${String(sinceSeq)}`),
  /** UX.md §2's "עצור" (stop) button, P9-T11 — always a 204, even for a run that already finished on its own (see routes/runs.ts). */
  stopRun: (runId: string) => request<void>(`/api/runs/${runId}/stop`, { method: "POST" }),

  keyStatus: () => request<KeyStatus>("/api/keys/status"),
  setKey: (apiKey: string) =>
    request<KeyStatus>("/api/keys", { method: "POST", body: JSON.stringify({ apiKey }) }),
  deleteKey: () => request<KeyStatus>("/api/keys", { method: "DELETE" }),

  environment: () => request<EnvironmentReport>("/api/environment"),
};
