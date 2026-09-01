import { extname, join, posix } from "node:path";
import { createParser, grammarForExtension, type SyntaxNode } from "./grammars.js";

export type SymbolKind = "function" | "class" | "interface" | "type" | "enum" | "const";

export interface RepoSymbol {
  name: string;
  kind: SymbolKind;
  exported: boolean;
  startLine: number;
  endLine: number;
}

export interface FileMap {
  path: string;
  symbols: RepoSymbol[];
  /** Raw import specifiers as written (relative or bare package names). */
  imports: string[];
  /** Names made available by this file's exports, including re-export
   * aliases and the literal "default" for `export default`. */
  exports: string[];
  isTest: boolean;
}

export interface RepoMapInput {
  path: string;
  text: string;
}

export interface RepoMap {
  files: FileMap[];
  /** Resolved-to-this-repo edges only — bare/external imports are recorded
   * in each file's `imports` but not resolved here. */
  dependencyGraph: Record<string, string[]>;
  entryPoints: string[];
  /** Test file path -> best-guess source file it covers, or null if none
   * could be inferred. */
  testMap: Record<string, string | null>;
}

const DECL_KIND_BY_NODE_TYPE: Record<string, SymbolKind> = {
  function_declaration: "function",
  generator_function_declaration: "function",
  class_declaration: "class",
  abstract_class_declaration: "class",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "enum",
};

const TEST_PATH_RE = /(^|\/)(__tests__\/.+|.+\.(test|spec))\.[cm]?[jt]sx?$/;

/**
 * Builds symbols, imports/exports, entry points, a dependency graph and a
 * test map from a set of already-extracted code files (P3-T5), using
 * web-tree-sitter grammars — zero LLM calls, all local parsing.
 */
export async function buildRepoMap(inputs: RepoMapInput[]): Promise<RepoMap> {
  const codeInputs = inputs.filter((f) => grammarForExtension(extname(f.path)) !== undefined);
  const files = await parseAll(codeInputs);

  const knownPaths = new Set(files.map((f) => f.path));
  const dependencyGraph = buildDependencyGraph(files, knownPaths);
  const entryPoints = detectEntryPoints(inputs, knownPaths);
  const testMap = buildTestMap(files, knownPaths);

  return { files, dependencyGraph, entryPoints, testMap };
}

async function parseAll(inputs: RepoMapInput[]): Promise<FileMap[]> {
  const byGrammar = new Map<string, RepoMapInput[]>();
  for (const input of inputs) {
    const grammar = grammarForExtension(extname(input.path));
    if (!grammar) continue;
    const bucket = byGrammar.get(grammar) ?? [];
    bucket.push(input);
    byGrammar.set(grammar, bucket);
  }

  const files: FileMap[] = [];
  for (const [grammarId, group] of byGrammar) {
    const parser = await createParser(grammarId as Parameters<typeof createParser>[0]);
    for (const input of group) {
      const tree = parser.parse(input.text);
      files.push(extractFileMap(input.path, tree.rootNode));
    }
  }
  return files;
}

function extractFileMap(path: string, root: SyntaxNode): FileMap {
  const symbols: RepoSymbol[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  for (let i = 0; i < root.namedChildCount; i++) {
    const node = root.namedChild(i);
    if (!node) continue;

    if (node.type === "import_statement") {
      const source = stringFieldText(node, "source");
      if (source) imports.push(source);
      continue;
    }

    if (node.type === "export_statement") {
      handleExportStatement(node, symbols, exports, imports);
      continue;
    }

    collectDeclaration(node, symbols, false);
  }

  return { path, symbols, imports, exports, isTest: TEST_PATH_RE.test(path) };
}

function handleExportStatement(
  node: SyntaxNode,
  symbols: RepoSymbol[],
  exports: string[],
  imports: string[],
): void {
  const isDefault = node.children.some((c) => c.type === "default");
  const reExportSource = stringFieldText(node, "source");
  if (reExportSource) imports.push(reExportSource);

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;

    if (child.type === "export_clause") {
      for (const specifier of child.namedChildren) {
        const alias = specifier.childForFieldName("alias")?.text;
        const name = specifier.childForFieldName("name")?.text ?? specifier.text;
        exports.push(alias ?? name);
      }
      continue;
    }

    if (child.type === "string") continue; // handled as reExportSource above

    const before = symbols.length;
    collectDeclaration(child, symbols, true);
    for (let s = before; s < symbols.length; s++) {
      const symbol = symbols[s];
      if (symbol) exports.push(symbol.name);
    }
  }

  if (isDefault && exports[exports.length - 1] !== "default") exports.push("default");
}

function collectDeclaration(node: SyntaxNode, symbols: RepoSymbol[], exported: boolean): void {
  const kind = DECL_KIND_BY_NODE_TYPE[node.type];
  if (kind) {
    const name = node.childForFieldName("name")?.text;
    if (name) {
      symbols.push({
        name,
        kind,
        exported,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
    }
    return;
  }

  if (node.type === "lexical_declaration") {
    for (const declarator of node.namedChildren) {
      if (declarator.type !== "variable_declarator") continue;
      const name = declarator.childForFieldName("name")?.text;
      if (name) {
        symbols.push({
          name,
          kind: "const",
          exported,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
      }
    }
  }
}

function stringFieldText(node: SyntaxNode, field: string): string | undefined {
  const stringNode = node.childForFieldName(field);
  if (!stringNode || stringNode.text.length < 2) return undefined;
  return stringNode.text.slice(1, -1);
}

const RESOLUTION_SUFFIXES = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const INDEX_SUFFIXES = RESOLUTION_SUFFIXES.filter((s) => s !== "").map((ext) => `/index${ext}`);

function resolveRelativeImport(
  fromPath: string,
  specifier: string,
  knownPaths: Set<string>,
): string | undefined {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(toPosix(fromPath)), specifier));

  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (knownPaths.has(candidate)) return candidate;
  }
  for (const suffix of INDEX_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (knownPaths.has(candidate)) return candidate;
  }
  return undefined;
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

function buildDependencyGraph(files: FileMap[], knownPaths: Set<string>): Record<string, string[]> {
  const graph: Record<string, string[]> = {};
  for (const file of files) {
    const resolved = new Set<string>();
    for (const specifier of file.imports) {
      const target = resolveRelativeImport(file.path, specifier, knownPaths);
      if (target && target !== file.path) resolved.add(target);
    }
    if (resolved.size > 0) graph[file.path] = [...resolved];
  }
  return graph;
}

interface PackageJsonShape {
  main?: unknown;
  module?: unknown;
}

function detectEntryPoints(inputs: RepoMapInput[], knownPaths: Set<string>): string[] {
  const entryPoints = new Set<string>();

  for (const input of inputs) {
    if (extname(input.path) !== ".json" || !input.path.endsWith("package.json")) continue;
    let pkg: PackageJsonShape;
    try {
      pkg = JSON.parse(input.text) as PackageJsonShape;
    } catch {
      continue;
    }
    const dir = posix.dirname(toPosix(input.path));
    for (const field of [pkg.main, pkg.module]) {
      if (typeof field !== "string") continue;
      const resolved = resolveDeclaredEntry(dir, field, knownPaths);
      if (resolved) entryPoints.add(resolved);
    }
  }

  for (const path of knownPaths) {
    const base = posix.basename(toPosix(path)).replace(/\.[cm]?[jt]sx?$/, "");
    const isTopLevel = !toPosix(path).includes("/");
    if (base === "index" && isTopLevel) entryPoints.add(path);
  }

  return [...entryPoints];
}

function resolveDeclaredEntry(dir: string, declared: string, knownPaths: Set<string>): string | undefined {
  const raw = posix.normalize(posix.join(dir, declared));
  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = `${raw}${suffix}`;
    if (knownPaths.has(candidate)) return candidate;
  }
  // Common case: package.json points at compiled dist output that isn't
  // among the source files we were given — fall back to the conventional
  // src/index.* for that package directory.
  for (const suffix of [".ts", ".tsx", ".js"]) {
    const candidate = join(dir, "src", `index${suffix}`).split("\\").join("/");
    if (knownPaths.has(candidate)) return candidate;
  }
  return undefined;
}

function buildTestMap(files: FileMap[], knownPaths: Set<string>): Record<string, string | null> {
  const testMap: Record<string, string | null> = {};
  for (const file of files) {
    if (!file.isTest) continue;
    testMap[file.path] = guessSourceForTest(file.path, knownPaths);
  }
  return testMap;
}

const TEST_SUFFIX_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Best-effort: only handles the `foo.test.ts` next to `foo.ts` convention.
 * A `__tests__/foo.ts` layout (no test-suffix in the filename) has no
 * reliable name-based sibling to guess, so it returns null rather than
 * fabricating a match. */
function guessSourceForTest(testPath: string, knownPaths: Set<string>): string | null {
  const posixPath = toPosix(testPath);
  if (!TEST_SUFFIX_RE.test(posixPath)) return null;

  const dir = posix.dirname(posixPath);
  const base = posix.basename(posixPath).replace(TEST_SUFFIX_RE, "");

  for (const suffix of RESOLUTION_SUFFIXES) {
    if (suffix === "") continue;
    const candidate = `${dir === "." ? base : `${dir}/${base}`}${suffix}`;
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}
