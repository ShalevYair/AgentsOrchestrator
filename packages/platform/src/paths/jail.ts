import { resolve, sep } from "node:path";

export interface JailResult {
  ok: boolean;
  resolvedPath: string;
  reason?: string;
}

function withTrailingSep(path: string): string {
  return path.endsWith(sep) ? path : path + sep;
}

/**
 * Resolves `candidate` against `root` and checks it stays inside it, using
 * a case-INSENSITIVE comparison regardless of the host OS. Windows and
 * macOS default filesystems are case-insensitive, so a naive
 * `resolved.startsWith(root)` check is bypassable there via a differently
 * cased path; comparing lowercase keeps the jail correct on every
 * platform — including the case-sensitive Linux box this was developed
 * on, where the bypass can't even be demonstrated locally, which is
 * exactly why this has dedicated unit tests instead of relying on the
 * OS's own behavior. A trailing separator is appended to both sides
 * before comparing so a sibling directory that merely shares the root as
 * a string prefix (e.g. "/base/stagingX") is not mistaken for being
 * inside "/base/staging".
 */
export function resolveWithinRoot(root: string, candidate: string): JailResult {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(root, candidate);

  const normalizedRoot = withTrailingSep(resolvedRoot).toLowerCase();
  const normalizedCandidate = withTrailingSep(resolvedCandidate).toLowerCase();

  if (!normalizedCandidate.startsWith(normalizedRoot)) {
    return { ok: false, resolvedPath: resolvedCandidate, reason: "path escapes the allowed root" };
  }
  return { ok: true, resolvedPath: resolvedCandidate };
}

/**
 * Windows' traditional MAX_PATH is 260 characters; we warn well under
 * that (240) to leave room for whatever a later stage appends (a file
 * extension, a "(1)" collision suffix) without silently crossing the
 * real limit.
 */
export const MAX_RECOMMENDED_PATH_LENGTH = 240;

export interface PathLengthCheck {
  ok: boolean;
  length: number;
  limit: number;
}

export function checkPathLength(path: string): PathLengthCheck {
  return {
    ok: path.length <= MAX_RECOMMENDED_PATH_LENGTH,
    length: path.length,
    limit: MAX_RECOMMENDED_PATH_LENGTH,
  };
}
