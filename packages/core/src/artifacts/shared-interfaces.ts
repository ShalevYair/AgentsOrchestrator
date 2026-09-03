import type { AssembledFile } from "../parse/index.js";

/**
 * P8-T9 — ARCHITECTURE.md §6: "לפני שלב קוד, שלב מוקדם מייצר את קובץ
 * הטיפוסים/ממשקים המשותף. כל הסוכנים חייבים לייבא ממנו ואסור להם להגדיר
 * מחדש. הממשק נכנס ל-Contract Block הממוטמן." This module has two jobs
 * matching those two sentences exactly: wrap the preliminary shared-types
 * file into Contract Block text every coder Task in the stage receives
 * (`buildContractBlockAddendum`), and catch a coder that redefined instead
 * of imported (`detectSharedInterfaceViolations`) — both purely, over
 * already-assembled file content, no I/O.
 *
 * Symbol extraction is regex-based against top-level `export` declarations
 * — the same "declared substitute, not real AST" honesty P7-T5's
 * `count-identifier-occurrences` already uses in this codebase (`packages/tools`
 * doesn't depend on `packages/ingest`, where the real tree-sitter `RepoMap`
 * lives, and pulling that dependency in here for one check wasn't a
 * decision this task should make on its own). It catches the common,
 * well-formed cases (`export interface Foo`, `export type Foo =`,
 * `export class Foo`, `export const Foo`, `export function Foo`) and says
 * so rather than silently missing more exotic declaration forms.
 */
export interface RedefinitionViolation {
  kind: "redefined-symbol";
  symbol: string;
  /** The file that redefined the symbol instead of importing it. */
  filePath: string;
}

export interface MissingImportViolation {
  kind: "missing-import";
  symbol: string;
  /** The file that uses the symbol but never imports it from the shared file. */
  filePath: string;
}

export type SharedInterfaceViolation = RedefinitionViolation | MissingImportViolation;

const TOP_LEVEL_EXPORT_DECLARATION =
  /^export\s+(?:default\s+)?(?:interface|type|class|const|function|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;

function declaredSymbols(content: string): Set<string> {
  const symbols = new Set<string>();
  for (const match of content.matchAll(TOP_LEVEL_EXPORT_DECLARATION)) symbols.add(match[1]!);
  return symbols;
}

function importsFrom(content: string, moduleBasename: string): boolean {
  const importLine = new RegExp(`^import\\s.*from\\s+["'][^"']*${moduleBasename}(?:\\.js)?["']`, "m");
  return importLine.test(content);
}

function moduleBasename(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.(ts|tsx|js|jsx)$/, "");
}

function usesSymbol(content: string, symbol: string): boolean {
  return new RegExp(`\\b${symbol}\\b`).test(content);
}

/**
 * Checks every non-shared file for the two failure modes ARCHITECTURE.md
 * §6 names: redefining a symbol the shared file already declares, or using
 * one without an import statement pointing at the shared file. A file that
 * neither uses nor redefines any shared symbol is simply not flagged —
 * this isn't "every file must import the shared file", only "don't
 * redefine or silently assume a symbol you never imported".
 */
export function detectSharedInterfaceViolations(
  sharedFile: AssembledFile,
  otherFiles: readonly AssembledFile[],
): SharedInterfaceViolation[] {
  const sharedSymbols = declaredSymbols(sharedFile.data);
  const sharedBasename = moduleBasename(sharedFile.path);
  const violations: SharedInterfaceViolation[] = [];

  for (const file of otherFiles) {
    if (file.path === sharedFile.path) continue;
    const ownDeclarations = declaredSymbols(file.data);
    const hasImport = importsFrom(file.data, sharedBasename);

    for (const symbol of sharedSymbols) {
      if (ownDeclarations.has(symbol)) {
        violations.push({ kind: "redefined-symbol", symbol, filePath: file.path });
        continue;
      }
      if (!hasImport && usesSymbol(file.data, symbol)) {
        violations.push({ kind: "missing-import", symbol, filePath: file.path });
      }
    }
  }

  return violations;
}

/**
 * The Contract Block text every coder Task in the stage receives
 * (ARCHITECTURE.md §5.3 point 1 / §7's context caching — this text is
 * exactly what a caller feeds into `ContractCache.getOrCreate`, P1-T8, so
 * it's created once per stage and reused across every fan-out Task rather
 * than re-sent per call). Labeled explicitly as import-only so the
 * instruction survives being pasted into a prompt, not just enforced after
 * the fact by `detectSharedInterfaceViolations`.
 */
export function buildContractBlockAddendum(sharedFile: AssembledFile): string {
  return [
    `שלד הממשקים המשותף (${sharedFile.path}) — ייבאו ממנו, לעולם אל תגדירו מחדש אף אחד מהסמלים שבו:`,
    "",
    sharedFile.data,
  ].join("\n");
}
