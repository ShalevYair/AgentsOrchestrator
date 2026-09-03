import type { ToolResult } from "@ao/shared";
import { runNodeTool } from "../runtime/node-runner.js";
import { runPythonTool } from "../runtime/python-runner.js";
import type { Sandbox } from "../sandbox/types.js";
import type { ToolRunLog, ToolRunRecord } from "./tool-run-log.js";

export interface RerunToolDeps {
  sandbox: Sandbox;
  stagingRoot: string;
  /** Required only when `record.tool.runtime === "python"`. */
  venvRoot?: string;
  runLog?: ToolRunLog;
}

/**
 * P7-T6 — "ניתן להרצה חוזרת מה-UI": a `ToolRunRecord` carries the complete
 * `LocalTool` it ran (full script, inputs, limits), so re-running it is
 * just dispatching to the same runner by `tool.runtime` — no separate
 * "replay" mechanism, no risk of the replay drifting from what actually ran.
 */
export async function rerunTool(record: ToolRunRecord, deps: RerunToolDeps): Promise<ToolResult> {
  if (record.tool.runtime === "python") {
    if (deps.venvRoot === undefined) {
      throw new Error("rerunTool: venvRoot is required to re-run a python LocalTool");
    }
    return runPythonTool({
      tool: record.tool,
      sandbox: deps.sandbox,
      stagingRoot: deps.stagingRoot,
      venvRoot: deps.venvRoot,
      ...(deps.runLog ? { runLog: deps.runLog } : {}),
    });
  }
  return runNodeTool({
    tool: record.tool,
    sandbox: deps.sandbox,
    stagingRoot: deps.stagingRoot,
    ...(deps.runLog ? { runLog: deps.runLog } : {}),
  });
}
