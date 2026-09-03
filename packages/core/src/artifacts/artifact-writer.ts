import { createHash } from "node:crypto";
import { validateArtifactPath, type ArtifactPathValidation } from "./filename-validate.js";

/**
 * `createHash` is the same `node:crypto` precedent `parse/ndjson.ts`
 * (P5-T7) already established for this package — hashing is pure
 * computation over bytes already in memory, not filesystem/network I/O,
 * so it doesn't cross the "packages/core stays I/O-free" line.
 */
export function computeSha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * The staging root's jail check, deliberately **not** imported from
 * `@ao/platform`'s `resolveWithinRoot` (P0-T10) even though the logic is
 * nearly identical: `packages/core`'s established layering rule
 * (P1-T1/P4-T1) is "depends only on `@ao/shared`" — `@ao/platform` is a
 * leaf package like `@ao/shared` itself (only depends on it + a couple of
 * pure libs), but adding it as a second real dependency here would still
 * be a first, and this check is ~10 lines of pure `node:path` logic, cheap
 * enough to duplicate and independently test rather than stretch the
 * boundary. Same case-insensitive-regardless-of-host-OS stance as the
 * original, for the same reason (Windows/macOS case-insensitive
 * filesystems make a naive `startsWith` bypassable).
 */
export interface StagingJailResult {
  ok: boolean;
  resolvedPath: string;
  reason?: string;
}

/**
 * Virtual `../`-resolution against a logical (always `/`-separated) path —
 * deliberately not `node:path.resolve` (whose behavior differs between its
 * win32/posix implementations), since this check has no real filesystem to
 * consult and only needs correct, host-independent segment-stack
 * semantics: **any** `..` that would pop past the root — not just one that
 * happens to survive to the end of the string — marks the path as
 * escaped, even if a later segment would have brought the string
 * representation back inside the root. A naive "join the stack and compare
 * as a string" approach (this module's first draft) missed exactly that
 * case: `"../../etc/passwd"` against root `/staging/run1` silently
 * clamped to `/staging/run1/etc/passwd` instead of being rejected, because
 * popping an already-empty stack was a silent no-op — caught by this
 * module's own traversal tests, not assumed correct on the first try.
 */
export function resolveWithinStagingRoot(stagingRoot: string, relativePath: string): StagingJailResult {
  const segments = relativePath.split("/");
  const stack: string[] = [];
  let escaped = false;
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) {
        escaped = true;
        continue;
      }
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  const resolvedPath = [stagingRoot.replace(/\/+$/, ""), ...stack].join("/");
  if (escaped) {
    return { ok: false, resolvedPath, reason: "path escapes the staging root" };
  }
  return { ok: true, resolvedPath };
}

export type WriteFileFn = (absolutePath: string, data: Buffer) => Promise<void>;

export interface StageArtifactParams {
  stagingRoot: string;
  relativePath: string;
  data: Buffer;
  expectedSha256: string;
  /** Actually writes the bytes to disk — injected, same dependency-injection boundary as `LLMProvider`/`RunLocalTool`/`RunCommand` elsewhere in this package, so `packages/core` never touches `node:fs` itself. */
  writeFile: WriteFileFn;
}

export type StageArtifactOutcome =
  | { ok: true; stagedPath: string; sha256: string }
  | { ok: false; reason: "invalid-filename"; detail: string; suggestedPath: string | undefined }
  | { ok: false; reason: "path-traversal"; detail: string }
  | { ok: false; reason: "hash-mismatch"; detail: string; computedSha256: string };

/**
 * P8-T6 — stages one artifact: validates its filename (Windows rules,
 * every platform), confirms its resolved path never escapes `stagingRoot`,
 * verifies its bytes actually hash to `expectedSha256`, and only then
 * writes. **Never throws for an expected rejection** — a bad name, a
 * traversal attempt, or a hash mismatch all come back as a structured
 * `StageArtifactOutcome`, the same "return a result, don't crash" contract
 * `extractArtifact` (P3-T3) and `runCodeValidation` (P8-T4) already use in
 * this codebase for expected-failure paths.
 */
export async function stageArtifact(params: StageArtifactParams): Promise<StageArtifactOutcome> {
  const nameCheck: ArtifactPathValidation = validateArtifactPath(params.relativePath);
  if (!nameCheck.valid) {
    return {
      ok: false,
      reason: "invalid-filename",
      detail: nameCheck.violations.map((v) => v.detail).join("; "),
      suggestedPath: nameCheck.suggestedPath,
    };
  }

  const jail = resolveWithinStagingRoot(params.stagingRoot, params.relativePath);
  if (!jail.ok) {
    return { ok: false, reason: "path-traversal", detail: jail.reason ?? "path escapes the staging root" };
  }

  const computedSha256 = computeSha256(params.data);
  if (computedSha256 !== params.expectedSha256) {
    return {
      ok: false,
      reason: "hash-mismatch",
      detail: `expected sha256 ${params.expectedSha256} but computed ${computedSha256}`,
      computedSha256,
    };
  }

  await params.writeFile(jail.resolvedPath, params.data);
  return { ok: true, stagedPath: jail.resolvedPath, sha256: computedSha256 };
}
