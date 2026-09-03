import type { LocalTool } from "@ao/shared";
import type { SandboxRunResult } from "../sandbox/types.js";

/**
 * P7-T6 — "כל הרצה נרשמת: סקריפט, פלט, קוד יציאה, זמן" (PROTOCOLS.md §6/§9's
 * `tool.executed` event: `{ toolId, script, exitCode, durationMs,
 * outputSize }`). `tool` here is the **full** `LocalTool` — including its
 * complete, never-truncated `script` — even when the run's own stdout/
 * stderr *was* truncated by `maxOutputBytes` (T2/T3's truncation is about
 * output, never about what code ran). That's what makes "המשתמש רואה כל
 * שורת קוד שרצה על המכונה שלו" true regardless of how noisy the output was.
 */
export interface ToolRunRecord {
  runId: string;
  tool: LocalTool;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  signal: string | null;
  /** stdout + stderr byte length actually captured (post-truncation, if any — see `truncated`). */
  outputBytes: number;
  truncated: boolean;
  networkBlocked: boolean;
  ok: boolean;
}

/** PROTOCOLS.md §9's `tool.executed` event payload, verbatim shape. */
export interface ToolExecutedEvent {
  toolId: string;
  script: string;
  exitCode: number | null;
  durationMs: number;
  outputSize: number;
}

export function toToolExecutedEvent(record: ToolRunRecord): ToolExecutedEvent {
  return {
    toolId: record.tool.id,
    script: record.tool.script,
    exitCode: record.exitCode,
    durationMs: record.durationMs,
    outputSize: record.outputBytes,
  };
}

/**
 * Pure in-memory recorder — the same role `EgressLedger` (P3-T10) plays for
 * egress: a primitive that matches the wire event's shape exactly, built to
 * be fed into a WebSocket emitter and a UI panel by whichever later task
 * wires those up (`apps/runtime`/`apps/web`), not attempting that wiring
 * itself here.
 */
export class ToolRunLog {
  private readonly records: ToolRunRecord[] = [];
  private counter = 0;

  record(tool: LocalTool, run: SandboxRunResult, startedAtMs: number): ToolRunRecord {
    this.counter += 1;
    const entry: ToolRunRecord = {
      runId: `tool-run-${String(this.counter)}`,
      tool,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(startedAtMs + run.durationMs).toISOString(),
      durationMs: run.durationMs,
      exitCode: run.exitCode,
      signal: run.signal,
      outputBytes: Buffer.byteLength(run.stdout, "utf8") + Buffer.byteLength(run.stderr, "utf8"),
      truncated: run.truncated,
      networkBlocked: run.networkBlocked,
      ok: run.ok,
    };
    this.records.push(entry);
    return entry;
  }

  list(): readonly ToolRunRecord[] {
    return this.records;
  }

  get(runId: string): ToolRunRecord | undefined {
    return this.records.find((entry) => entry.runId === runId);
  }
}
