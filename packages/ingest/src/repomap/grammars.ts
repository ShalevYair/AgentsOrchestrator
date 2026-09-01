import { createRequire } from "node:module";
import Parser from "web-tree-sitter";

export type SyntaxNode = Parser.SyntaxNode;
export type TreeSitterLanguage = Parser.Language;

export type GrammarId = "typescript" | "tsx" | "javascript";

const GRAMMAR_FILES: Record<GrammarId, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
};

const CODE_EXTENSION_GRAMMAR: Record<string, GrammarId> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
};

export function grammarForExtension(ext: string): GrammarId | undefined {
  return CODE_EXTENSION_GRAMMAR[ext.toLowerCase()];
}

let initPromise: Promise<void> | undefined;
const languageCache = new Map<GrammarId, Promise<TreeSitterLanguage>>();

function ensureInit(): Promise<void> {
  initPromise ??= Parser.init();
  return initPromise;
}

/**
 * Loads a language grammar once per process and reuses it across every
 * file of that language — parsing 1000 files creates one `Parser` per
 * file, but the ~1-2MB grammar wasm itself is only loaded once each. That
 * reuse is what keeps a medium repo's mapping under the P3-T5 10s budget.
 * Pinned to web-tree-sitter@0.20.8 + tree-sitter-wasms@0.1.13 — verified
 * empirically that a newer web-tree-sitter (0.27's dylink wasm ABI)
 * doesn't load these prebuilt grammar files.
 */
export async function loadLanguage(id: GrammarId): Promise<TreeSitterLanguage> {
  await ensureInit();
  let promise = languageCache.get(id);
  if (!promise) {
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve(`tree-sitter-wasms/out/${GRAMMAR_FILES[id]}`);
    promise = Parser.Language.load(wasmPath);
    languageCache.set(id, promise);
  }
  return promise;
}

export async function createParser(id: GrammarId): Promise<Parser> {
  const language = await loadLanguage(id);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
