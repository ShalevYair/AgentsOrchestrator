/**
 * P8-T6 — "ולידציית שמות לפי כללי Windows, נאכפת בכל הפלטפורמות"
 * (ARCHITECTURE.md §11 / §8's own reasoning: agents choose filenames, so
 * this is a real failure point that must be caught on every developer's
 * machine, not just discovered by a Windows user in production). Every
 * check below is pure string logic with **no dependency on `process.platform`
 * or `node:path`'s platform-specific behavior** — Windows' reserved-name
 * and forbidden-character rules are hardcoded and checked unconditionally,
 * the same "defensive regardless of host OS" stance `@ao/platform`'s
 * `resolveWithinRoot` (P0-T10) already takes for case-insensitive path
 * jailing. That is what makes this module's own test suite — which can
 * only physically run on this session's Linux box — actually representative
 * of Windows/macOS behavior too: there is no OS branch to diverge on.
 */

/** Windows device names, reserved regardless of extension (`aux.ts` is just as reserved as `aux`) and case (`Aux`, `AUX`). */
const WINDOWS_RESERVED_BASENAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/** `< > : " | ? *` plus C0 control bytes (0x00–0x1F) — all illegal in a Windows filename. Control bytes are the intended match target here, not an accident — hence the targeted lint disable. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS_PATTERN = /[<>:"|?*\x00-\x1f]/;
/** Same character class, `g`-flagged for `fixSegment`'s replace-all — kept as a second literal rather than reusing `FORBIDDEN_CHARS_PATTERN.source` with `lastIndex` juggling, since a shared stateful global regex is an easy source of subtle bugs across calls. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS_PATTERN_GLOBAL = /[<>:"|?*\x00-\x1f]/g;

/** Windows' traditional `MAX_PATH`. Distinct from `@ao/platform`'s `MAX_RECOMMENDED_PATH_LENGTH` (240) — that one is a soft warning threshold for the local staging/sandbox jail; this is the hard artifact-path reject threshold this task specifically calls for. */
export const MAX_ARTIFACT_PATH_LENGTH = 260;

export type FilenameViolationKind =
  "reserved-name" | "forbidden-character" | "trailing-dot-or-space" | "path-too-long" | "empty-segment";

export interface FilenameViolation {
  kind: FilenameViolationKind;
  segment: string;
  detail: string;
}

export interface ArtifactPathValidation {
  valid: boolean;
  violations: FilenameViolation[];
  /** A mechanically-fixed alternative path, always present when `valid` is false — P8-T6's own done-criterion: an invalid name produces a suggestion for the agent, never just a rejection with nothing to do about it. */
  suggestedPath?: string;
}

function baseNameWithoutExtension(segment: string): string {
  const dotIndex = segment.indexOf(".");
  return dotIndex === -1 ? segment : segment.slice(0, dotIndex);
}

function validateSegment(segment: string): FilenameViolation[] {
  const violations: FilenameViolation[] = [];
  if (segment.length === 0) {
    violations.push({ kind: "empty-segment", segment, detail: "path segment is empty" });
    return violations; // nothing else is meaningful to check on an empty segment
  }
  if (segment === "." || segment === "..") {
    // Not a filename at all — relative-path navigation syntax. Whether
    // it's *allowed* here (it isn't, for a well-formed agent-produced
    // artifact path) is the staging jail's job (`resolveWithinStagingRoot`
    // in `artifact-writer.ts`), not this module's: checking it here too
    // would wrongly report ".." as a Windows filename violation
    // ("trailing dot") when the real problem is path traversal, a
    // different failure kind with a different fix (there's no sensible
    // "suggested alternative filename" for a navigation token).
    return violations;
  }
  if (WINDOWS_RESERVED_BASENAMES.has(baseNameWithoutExtension(segment).toLowerCase())) {
    violations.push({
      kind: "reserved-name",
      segment,
      detail: `"${segment}" uses the Windows-reserved device name "${baseNameWithoutExtension(segment).toLowerCase()}"`,
    });
  }
  if (FORBIDDEN_CHARS_PATTERN.test(segment)) {
    violations.push({
      kind: "forbidden-character",
      segment,
      detail: `"${segment}" contains a character forbidden on Windows (< > : " | ? * or a control byte)`,
    });
  }
  if (/[. ]$/.test(segment)) {
    violations.push({
      kind: "trailing-dot-or-space",
      segment,
      detail: `"${segment}" ends with a dot or a space, which Windows silently strips`,
    });
  }
  return violations;
}

function fixSegment(segment: string): string {
  if (segment.length === 0) return "_";
  if (segment === "." || segment === "..") return segment; // navigation syntax, not a filename — leave untouched
  let fixed = segment;
  const base = baseNameWithoutExtension(fixed);
  if (WINDOWS_RESERVED_BASENAMES.has(base.toLowerCase())) {
    fixed = fixed.length === base.length ? `${base}_file` : `${base}_file${fixed.slice(base.length)}`;
  }
  fixed = fixed.replace(FORBIDDEN_CHARS_PATTERN_GLOBAL, "_");
  fixed = fixed.replace(/[. ]+$/, "");
  return fixed.length === 0 ? "_" : fixed;
}

/**
 * Validates every segment of `relativePath` (a `/`-separated artifact
 * path, independent of the host's own path separator — artifact paths in
 * this project are always logical/POSIX-style, matching `AssembledFile.path`
 * from P5-T7's NDJSON parser) against the Windows filename rules, plus the
 * whole path's total length. Never throws — a fully-invalid path still
 * returns a structured result with every violation and a best-effort
 * `suggestedPath`, so a caller can hand the suggestion back to the
 * generating agent instead of crashing (P8-T6's own done-criterion).
 */
export function validateArtifactPath(relativePath: string): ArtifactPathValidation {
  const segments = relativePath.split("/");
  const violations = segments.flatMap(validateSegment);

  if (relativePath.length > MAX_ARTIFACT_PATH_LENGTH) {
    violations.push({
      kind: "path-too-long",
      segment: relativePath,
      detail: `path is ${String(relativePath.length)} characters, exceeding the ${String(MAX_ARTIFACT_PATH_LENGTH)}-character limit`,
    });
  }

  if (violations.length === 0) return { valid: true, violations };
  return buildInvalidResult(segments, violations);
}

function buildInvalidResult(segments: string[], violations: FilenameViolation[]): ArtifactPathValidation {
  let suggestedPath = segments.map(fixSegment).join("/");
  if (suggestedPath.length > MAX_ARTIFACT_PATH_LENGTH) {
    const dotIndex = suggestedPath.lastIndexOf(".");
    const extension = dotIndex > suggestedPath.lastIndexOf("/") ? suggestedPath.slice(dotIndex) : "";
    const keep = MAX_ARTIFACT_PATH_LENGTH - extension.length;
    suggestedPath = suggestedPath.slice(0, Math.max(1, keep)) + extension;
  }
  return { valid: false, violations, suggestedPath };
}
