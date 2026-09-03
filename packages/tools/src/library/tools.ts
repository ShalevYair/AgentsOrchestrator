import type { LocalTool } from "@ao/shared";

const DEFAULT_LIMITS = { timeoutMs: 30_000, maxOutputBytes: 65_536, memoryMb: 256, network: false };

export interface CountFilesMatchingParams {
  dir: string;
  /** A RegExp source (not a literal substring) tested against each file's full content. */
  pattern: string;
  /** Restrict to files whose name ends with one of these (e.g. [".ts", ".js"]); omit to scan every file. */
  extensions?: string[];
}

/** ספירות — "how many files match X". */
export function buildCountFilesMatchingTool(params: CountFilesMatchingParams): LocalTool {
  const script = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const inputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
    "const re = new RegExp(inputs.pattern);",
    "function walk(dir) {",
    "  let count = 0;",
    "  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {",
    "    const full = path.join(dir, entry.name);",
    "    if (entry.isDirectory()) { count += walk(full); continue; }",
    "    if (inputs.extensions.length > 0 && !inputs.extensions.some((ext) => entry.name.endsWith(ext))) continue;",
    "    const content = fs.readFileSync(full, 'utf8');",
    "    if (re.test(content)) count++;",
    "  }",
    "  return count;",
    "}",
    "console.log(JSON.stringify({ count: walk(inputs.dir) }));",
  ].join("\n");

  return {
    id: "library.count-files-matching",
    runtime: "node",
    source: "registry",
    script,
    inputs: { dir: params.dir, pattern: params.pattern, extensions: params.extensions ?? [] },
    limits: DEFAULT_LIMITS,
    expectedOutput: "json",
  };
}

export interface GrepParams {
  dir: string;
  pattern: string;
  extensions?: string[];
  /** Caps how many matches are returned, independent of `limits.maxOutputBytes` — a corpus-wide grep can have far more hits than fit in the output cap; this keeps the *count* honest even when the returned list is capped. */
  maxMatches?: number;
}

/** greps — file+line matches for a pattern across a directory, capped so a huge corpus can't blow the output budget. */
export function buildGrepTool(params: GrepParams): LocalTool {
  const script = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const inputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
    "const re = new RegExp(inputs.pattern);",
    "const matches = [];",
    "let totalMatches = 0;",
    "function walk(dir) {",
    "  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {",
    "    const full = path.join(dir, entry.name);",
    "    if (entry.isDirectory()) { walk(full); continue; }",
    "    if (inputs.extensions.length > 0 && !inputs.extensions.some((ext) => entry.name.endsWith(ext))) continue;",
    "    const lines = fs.readFileSync(full, 'utf8').split('\\n');",
    "    for (let i = 0; i < lines.length; i++) {",
    "      if (re.test(lines[i])) {",
    "        totalMatches++;",
    "        if (matches.length < inputs.maxMatches) matches.push({ file: full, line: i + 1, text: lines[i] });",
    "      }",
    "    }",
    "  }",
    "}",
    "walk(inputs.dir);",
    "console.log(JSON.stringify({ totalMatches, matches, truncatedMatchList: totalMatches > matches.length }));",
  ].join("\n");

  return {
    id: "library.grep",
    runtime: "node",
    source: "registry",
    script,
    inputs: {
      dir: params.dir,
      pattern: params.pattern,
      extensions: params.extensions ?? [],
      maxMatches: params.maxMatches ?? 200,
    },
    limits: DEFAULT_LIMITS,
    expectedOutput: "json",
  };
}

export interface FileStatsParams {
  dir: string;
}

/** סטטיסטיקות — file count, total bytes, and a breakdown by extension. */
export function buildFileStatsTool(params: FileStatsParams): LocalTool {
  const script = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const inputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
    "let fileCount = 0;",
    "let totalBytes = 0;",
    "const byExtension = {};",
    "function walk(dir) {",
    "  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {",
    "    const full = path.join(dir, entry.name);",
    "    if (entry.isDirectory()) { walk(full); continue; }",
    "    const ext = path.extname(entry.name) || '(none)';",
    "    const size = fs.statSync(full).size;",
    "    fileCount++;",
    "    totalBytes += size;",
    "    byExtension[ext] = byExtension[ext] || { count: 0, bytes: 0 };",
    "    byExtension[ext].count++;",
    "    byExtension[ext].bytes += size;",
    "  }",
    "}",
    "walk(inputs.dir);",
    "console.log(JSON.stringify({ fileCount, totalBytes, byExtension }));",
  ].join("\n");

  return {
    id: "library.file-stats",
    runtime: "node",
    source: "registry",
    script,
    inputs: { dir: params.dir },
    limits: DEFAULT_LIMITS,
    expectedOutput: "json",
  };
}

export interface CountIdentifierOccurrencesParams {
  dir: string;
  identifier: string;
  extensions?: string[];
}

/**
 * שאילתות AST — **a deliberately simplified stand-in, not a real parser.**
 * A genuine AST-level query would reuse `packages/ingest`'s `web-tree-sitter`
 * RepoMap (P3-T5), but `packages/tools` has no dependency on `packages/ingest`
 * and adding one is a real architectural decision (which package owns
 * parsing), not something to bolt on quietly here. This counts
 * whole-word occurrences of an identifier via a word-boundary regex —
 * useful for "how many places reference X" but, unlike a real AST query,
 * can't distinguish a variable from a string literal that happens to
 * contain the same word, or resolve renamed imports. Documented as a known
 * limitation, not hidden.
 */
export function buildCountIdentifierOccurrencesTool(params: CountIdentifierOccurrencesParams): LocalTool {
  const script = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const inputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
    "const re = new RegExp('\\\\b' + inputs.identifier.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b', 'g');",
    "let occurrences = 0;",
    "let filesWithOccurrence = 0;",
    "function walk(dir) {",
    "  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {",
    "    const full = path.join(dir, entry.name);",
    "    if (entry.isDirectory()) { walk(full); continue; }",
    "    if (inputs.extensions.length > 0 && !inputs.extensions.some((ext) => entry.name.endsWith(ext))) continue;",
    "    const content = fs.readFileSync(full, 'utf8');",
    "    const found = content.match(re);",
    "    if (found) { occurrences += found.length; filesWithOccurrence++; }",
    "  }",
    "}",
    "walk(inputs.dir);",
    "console.log(JSON.stringify({ occurrences, filesWithOccurrence }));",
  ].join("\n");

  return {
    id: "library.count-identifier-occurrences",
    runtime: "node",
    source: "registry",
    script,
    inputs: { dir: params.dir, identifier: params.identifier, extensions: params.extensions ?? [] },
    limits: DEFAULT_LIMITS,
    expectedOutput: "json",
  };
}

export interface JsonArrayToCsvParams {
  /** Path to a JSON file whose top-level value is an array of flat objects. */
  jsonFilePath: string;
}

/** מעברי סכמה — JSON array-of-objects to CSV, columns taken from the union of keys across all rows. */
export function buildJsonArrayToCsvTool(params: JsonArrayToCsvParams): LocalTool {
  const script = [
    "const fs = require('fs');",
    "const inputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
    "const rows = JSON.parse(fs.readFileSync(inputs.jsonFilePath, 'utf8'));",
    "if (!Array.isArray(rows)) { console.log(JSON.stringify({ error: 'input JSON is not an array' })); process.exit(1); }",
    "const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];",
    "function csvCell(value) {",
    "  const text = value === undefined || value === null ? '' : String(value);",
    "  return /[\",\\n]/.test(text) ? '\"' + text.replace(/\"/g, '\"\"') + '\"' : text;",
    "}",
    "const lines = [columns.join(',')];",
    "for (const row of rows) lines.push(columns.map((col) => csvCell(row[col])).join(','));",
    "console.log(JSON.stringify({ csv: lines.join('\\n'), rowCount: rows.length, columns }));",
  ].join("\n");

  return {
    id: "library.json-array-to-csv",
    runtime: "node",
    source: "registry",
    script,
    inputs: { jsonFilePath: params.jsonFilePath },
    limits: DEFAULT_LIMITS,
    expectedOutput: "json",
  };
}
