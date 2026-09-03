import { diffLines, formatUnifiedDiff } from "./text-diff.js";

/**
 * P8-T7 — "כתיבה לתיקייה: diff → אישור מפורש → כתיבה עם גיבוי", off by
 * default per [Q3](../../../../docs/DECISIONS.md#q3--כתיבה-לתיקייה-של-המשתמש--עד-כמה-אגרסיבית)
 * ("ידני בלבד בגרסה 1"). `DEFAULT_FOLDER_WRITE_ENABLED` makes that default
 * a concrete, testable constant rather than an implicit assumption a
 * caller has to remember to uphold.
 */
export const DEFAULT_FOLDER_WRITE_ENABLED = false;

export type ReadExistingFn = () => Promise<Buffer | null>;
/** Distinct from `artifact-writer.ts`'s `WriteFileFn` — this one has no `absolutePath` parameter because the target path is already fixed by the caller before this module is even invoked (folder-writing targets one specific, already-known file in the user's real folder, not an arbitrary staged path). */
export type FolderWriteFn = (data: Buffer) => Promise<void>;
/** Returns the backup's own path/identifier, for display and for the "אף פעם לא שקטה" transparency requirement. */
export type WriteBackupFn = (data: Buffer) => Promise<string>;

export interface WriteToFolderParams {
  /** Q3's global feature flag — the write half of this function never runs at all unless the caller explicitly opts in, regardless of `approved`. */
  enabled: boolean;
  /** Per-write, explicit user approval — UX.md §6's "אישור מפורש", separate from the global `enabled` flag: turning the feature on once doesn't itself approve any specific write. */
  approved: boolean;
  newContent: Buffer;
  /** DI'd, same boundary as every other real-I/O call in this package (`RunCommand`, `writeFile` in T6). `null` means the target file doesn't exist yet — a create, not a replace, so no backup is needed. */
  readExisting: ReadExistingFn;
  writeFile: FolderWriteFn;
  writeBackup: WriteBackupFn;
}

export interface WriteToFolderOutcome {
  wrote: boolean;
  /** Unified-diff text against the existing content (empty existing content when this is a new file) — always populated, even when `wrote` is false, so a caller can still show *what would have changed* and why it didn't happen. */
  diff: string;
  backupPath?: string;
  /** Set only when `wrote` is false — the specific reason nothing happened. Never silently absent: T7's own done-criterion is "אף פעם לא שקטה" (never silent), so a caller always has either a `backupPath`+`wrote:true` or a `reason` to show. */
  reason?: "disabled" | "not-approved";
}

/**
 * Never silent: every path through this function returns a `diff` and
 * either `wrote:true` (with a `backupPath` when an existing file was
 * replaced) or `wrote:false` with an explicit `reason`. There is no
 * return shape that says nothing at all.
 */
export async function writeToFolder(params: WriteToFolderParams): Promise<WriteToFolderOutcome> {
  const existing = await params.readExisting();
  const diff = formatUnifiedDiff(
    diffLines(existing?.toString("utf8") ?? "", params.newContent.toString("utf8")),
  );

  if (!params.enabled) {
    return { wrote: false, diff, reason: "disabled" };
  }
  if (!params.approved) {
    return { wrote: false, diff, reason: "not-approved" };
  }

  let backupPath: string | undefined;
  if (existing !== null) {
    backupPath = await params.writeBackup(existing);
  }
  await params.writeFile(params.newContent);

  return backupPath !== undefined ? { wrote: true, diff, backupPath } : { wrote: true, diff };
}
