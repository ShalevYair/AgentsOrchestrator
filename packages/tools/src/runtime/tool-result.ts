import type { LocalTool, ToolResult } from "@ao/shared";
import type { SandboxRunResult } from "../sandbox/types.js";

/**
 * PROTOCOLS.md §11: "פלט שחורג מהתקרה נחתך ומסומן — הסוכן לא מקבל שקט
 * מטעה" — `truncated` is carried through in every branch below, including
 * the failure ones, precisely so a truncated failure can't be mistaken for
 * a clean one.
 */
export function buildToolResult(tool: LocalTool, run: SandboxRunResult): ToolResult {
  if (!run.ok) {
    return {
      t: "tool_result",
      toolId: tool.id,
      ok: false,
      data: {
        error: run.timedOut ? "timeout" : "non-zero exit",
        exitCode: run.exitCode,
        signal: run.signal,
        stderr: run.stderr,
      },
      truncated: run.truncated,
    };
  }

  if (tool.expectedOutput === "json") {
    try {
      const data: unknown = JSON.parse(run.stdout.trim());
      return { t: "tool_result", toolId: tool.id, ok: true, data, truncated: run.truncated };
    } catch (error) {
      return {
        t: "tool_result",
        toolId: tool.id,
        ok: false,
        data: {
          error: "script exited 0 but stdout was not valid JSON",
          parseError: error instanceof Error ? error.message : String(error),
          raw: run.stdout,
        },
        truncated: run.truncated,
      };
    }
  }

  // "text" and "csv" are both returned as the raw captured stdout —
  // PROTOCOLS.md §11 doesn't specify CSV parsing, and a toolsmith-written
  // script producing CSV can just as well `json.dumps` a table if the
  // caller wants structure; forcing a specific CSV dialect here would be
  // guessing at a contract that was never written down.
  return { t: "tool_result", toolId: tool.id, ok: true, data: run.stdout, truncated: run.truncated };
}
