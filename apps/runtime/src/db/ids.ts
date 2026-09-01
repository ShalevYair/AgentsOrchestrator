import { randomUUID } from "node:crypto";

/**
 * `RunIdSchema` (`@ao/shared`) requires `run_[A-Za-z0-9]+` — no hyphens —
 * so run ids strip them out of the UUID. The other id kinds don't cross
 * that schema boundary, but we keep them alnum-only too for consistency
 * and Windows/URL friendliness.
 */
function alnumId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export const genThreadId = (): string => alnumId("thr");
export const genMessageId = (): string => alnumId("msg");
export const genRunId = (): string => alnumId("run");
