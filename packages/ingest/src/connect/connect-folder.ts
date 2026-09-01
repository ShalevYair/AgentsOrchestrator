import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_IGNORE_PATTERNS,
  buildMatcher,
  readIgnoreFile,
  scopePatternsToDir,
} from "../ignore/ignore-rules.js";

export interface ConnectedFile {
  /** Root-relative, POSIX-separated (even on Windows) so paths are stable
   * across platforms in artifact ids, chunk ids, and the RepoMap. */
  path: string;
  absolutePath: string;
  sizeBytes: number;
}

export interface FolderTreeNode {
  path: string;
  name: string;
  isDirectory: boolean;
  /** File size, or the recursive sum of children for a directory. */
  sizeBytes: number;
  children?: FolderTreeNode[];
}

export interface ConnectFolderProgress {
  filesScanned: number;
  bytesScanned: number;
  currentPath: string;
}

export interface ConnectFolderOptions {
  /** Extra gitignore-syntax patterns layered on top of .gitignore/.aoignore
   * — e.g. an explicit exclude from the UI's include/exclude tree, or a
   * `!pattern` to force-include something the ignore files exclude. */
  extraIgnorePatterns?: string[];
  onProgress?: (progress: ConnectFolderProgress) => void;
  signal?: AbortSignal;
}

export interface ConnectFolderResult {
  root: string;
  tree: FolderTreeNode;
  files: ConnectedFile[];
  totalFiles: number;
  totalBytes: number;
  ignoredCount: number;
}

/**
 * Walks `root`, honoring .gitignore + .aoignore at every directory level
 * (nested ignore files are scoped to their own subtree, matching real git
 * semantics), and returns both a flat file list and a sized tree (P3-T2).
 * The walk is a plain async DFS over `fs.promises` — each `await` yields to
 * the event loop, and progress is reported incrementally via `onProgress`,
 * which is what keeps a 10K-file scan from blocking anything downstream of
 * it rather than any special batching trick.
 */
export async function connectFolder(
  root: string,
  options: ConnectFolderOptions = {},
): Promise<ConnectFolderResult> {
  const files: ConnectedFile[] = [];
  let totalBytes = 0;
  let ignoredCount = 0;
  let filesScanned = 0;

  // extraIgnorePatterns is the caller's explicit UI-driven include/exclude
  // override and always wins — gitignore semantics apply later patterns
  // with higher precedence, so it's appended last at every directory
  // level, never folded into the inherited/scoped .gitignore chain.
  const overridePatterns = options.extraIgnorePatterns ?? [];

  async function walk(absDir: string, relDir: string, inheritedPatterns: string[]): Promise<FolderTreeNode> {
    throwIfAborted(options.signal);

    const gitignore = await readIgnoreFile(absDir, ".gitignore");
    const aoignore = await readIgnoreFile(absDir, ".aoignore");
    const ownPatterns = scopePatternsToDir([...gitignore, ...aoignore], relDir);
    const patterns = [...inheritedPatterns, ...ownPatterns];
    const matcher = buildMatcher([...patterns, ...overridePatterns]);

    const entries = await readdir(absDir, { withFileTypes: true });
    const children: FolderTreeNode[] = [];
    let dirSize = 0;

    for (const entry of entries) {
      throwIfAborted(options.signal);

      const entryRelPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const testPath = entry.isDirectory() ? `${entryRelPath}/` : entryRelPath;
      if (matcher.ignores(testPath)) {
        ignoredCount++;
        continue;
      }

      if (entry.isDirectory()) {
        const childNode = await walk(join(absDir, entry.name), entryRelPath, patterns);
        children.push(childNode);
        dirSize += childNode.sizeBytes;
      } else if (entry.isFile()) {
        const absPath = join(absDir, entry.name);
        const info = await stat(absPath);
        filesScanned++;
        totalBytes += info.size;
        dirSize += info.size;
        files.push({ path: entryRelPath, absolutePath: absPath, sizeBytes: info.size });
        children.push({
          path: entryRelPath,
          name: entry.name,
          isDirectory: false,
          sizeBytes: info.size,
        });
        options.onProgress?.({ filesScanned, bytesScanned: totalBytes, currentPath: entryRelPath });
      }
      // Symlinks are neither isFile() nor isDirectory() here (lstat-like
      // dirents from readdir don't follow them) — skipped to avoid cycles.
    }

    return {
      path: relDir,
      name: relDir === "" ? "." : (relDir.split("/").pop() ?? relDir),
      isDirectory: true,
      sizeBytes: dirSize,
      children,
    };
  }

  const tree = await walk(root, "", [...DEFAULT_IGNORE_PATTERNS]);

  return { root, tree, files, totalFiles: files.length, totalBytes, ignoredCount };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("connectFolder aborted", "AbortError");
  }
}
