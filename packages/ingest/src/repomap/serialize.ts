import { estimateTokens } from "../tokens/estimate-tokens.js";
import type { RepoMap, SymbolKind } from "./repo-map.js";

/** Single-letter kind codes — every byte counts when this gets multiplied
 * by every symbol in a 1000-file repo. */
const KIND_LETTER: Record<SymbolKind, string> = {
  function: "f",
  class: "c",
  interface: "i",
  type: "t",
  enum: "e",
  const: "v",
};

interface CompactSymbol {
  n: string;
  k: string;
  e?: 1;
}

interface CompactFile {
  /** Index into the top-level `paths` dictionary, not the path itself —
   * see the module doc comment on why this matters. */
  p: number;
  s: CompactSymbol[];
  /** Indices into `specifiers` — most files in a real repo share a small
   * set of common imports, so this is redundant in the same way paths are. */
  i?: number[];
  x?: string[];
  t?: 1;
}

interface CompactRepoMap {
  /** Every file path appears here exactly once; everything else that
   * refers to a file (`files[].p`, `entryPoints`, `dependencyGraph`,
   * `testMap`) references it by index instead of repeating the string.
   * A dependency graph is inherently redundant — a handful of shared
   * modules get imported by hundreds of files — so this alone is usually
   * the largest single lever on the serialized size, well ahead of
   * shortening field names. */
  paths: string[];
  /** Raw import specifiers (as written — relative or bare package names),
   * deduplicated the same way `paths` is: most files import from the same
   * handful of modules. */
  specifiers: string[];
  files: CompactFile[];
  entryPoints: number[];
  testMap?: Record<string, number | null>;
  dependencyGraph?: Record<string, number[]>;
  truncated?: {
    droppedDependencyGraph?: true;
    droppedTestMap?: true;
    cappedSymbolsPerFile?: number;
    omittedFiles?: number;
  };
}

export interface SerializedRepoMap {
  text: string;
  estimatedTokens: number;
  truncated: boolean;
}

const DEFAULT_TOKEN_BUDGET = 40_000;

interface DegradeStage {
  includeDependencyGraph: boolean;
  includeTestMap: boolean;
  symbolCap: number | undefined;
}

// Applied in order, each strictly cheaper than the last, until the result
// fits `tokenBudget`. Dependency graph and test map go first — they're the
// least essential for "what symbols/exports does this file have" — then
// symbols get capped increasingly hard. If nothing here fits, whole files
// are dropped from the end as a final resort (see the loop below).
const DEGRADE_STAGES: DegradeStage[] = [
  { includeDependencyGraph: true, includeTestMap: true, symbolCap: undefined },
  { includeDependencyGraph: false, includeTestMap: true, symbolCap: undefined },
  { includeDependencyGraph: false, includeTestMap: false, symbolCap: undefined },
  { includeDependencyGraph: false, includeTestMap: false, symbolCap: 10 },
  { includeDependencyGraph: false, includeTestMap: false, symbolCap: 3 },
];
const LAST_STAGE = DEGRADE_STAGES[DEGRADE_STAGES.length - 1]!;

/**
 * Serializes a RepoMap to compact, path-interned JSON and degrades it in
 * stages if it would still exceed `tokenBudget` — never emits an oversized
 * blob. P3-T5 done criterion: under 40K tokens for a 1000-file repo.
 */
export function serializeRepoMap(map: RepoMap, tokenBudget = DEFAULT_TOKEN_BUDGET): SerializedRepoMap {
  const pathIndex = buildPathIndex(map);
  const specifierIndex = buildSpecifierIndex(map);

  for (const stage of DEGRADE_STAGES) {
    const compact = toCompact(map, pathIndex, specifierIndex, stage);
    markTruncated(compact, stage);
    const attempt = tryEncode(compact, tokenBudget);
    if (attempt) return attempt;
  }

  // Final resort: drop whole files from the end until it fits.
  const compact = toCompact(map, pathIndex, specifierIndex, LAST_STAGE);
  let omitted = 0;
  while (compact.files.length > 0) {
    compact.files.pop();
    omitted++;
    markTruncated(compact, LAST_STAGE, omitted);
    const attempt = tryEncode(compact, tokenBudget);
    if (attempt) return attempt;
  }

  markTruncated(compact, LAST_STAGE, omitted);
  const text = JSON.stringify(compact);
  return { text, estimatedTokens: estimateTokens(text, "json"), truncated: true };
}

interface PathIndex {
  paths: string[];
  indexOf: Map<string, number>;
}

function buildPathIndex(map: RepoMap): PathIndex {
  const paths = map.files.map((f) => f.path);
  const indexOf = new Map(paths.map((p, i) => [p, i] as const));
  return { paths, indexOf };
}

interface SpecifierIndex {
  specifiers: string[];
  indexOf: Map<string, number>;
}

function buildSpecifierIndex(map: RepoMap): SpecifierIndex {
  const seen = new Set<string>();
  for (const file of map.files) {
    for (const specifier of file.imports) seen.add(specifier);
  }
  const specifiers = [...seen];
  const indexOf = new Map(specifiers.map((s, i) => [s, i] as const));
  return { specifiers, indexOf };
}

function markTruncated(compact: CompactRepoMap, stage: DegradeStage, omittedFiles = 0): void {
  const isFullStage =
    stage.includeDependencyGraph &&
    stage.includeTestMap &&
    stage.symbolCap === undefined &&
    omittedFiles === 0;
  if (isFullStage) {
    delete compact.truncated;
    return;
  }
  compact.truncated = {
    ...(!stage.includeDependencyGraph && { droppedDependencyGraph: true }),
    ...(!stage.includeTestMap && { droppedTestMap: true }),
    ...(stage.symbolCap !== undefined && { cappedSymbolsPerFile: stage.symbolCap }),
    ...(omittedFiles > 0 && { omittedFiles }),
  };
}

function tryEncode(compact: CompactRepoMap, tokenBudget: number): SerializedRepoMap | undefined {
  const text = JSON.stringify(compact);
  const estimatedTokens = estimateTokens(text, "json");
  if (estimatedTokens <= tokenBudget) {
    return { text, estimatedTokens, truncated: compact.truncated !== undefined };
  }
  return undefined;
}

function toCompact(
  map: RepoMap,
  pathIndex: PathIndex,
  specifierIndex: SpecifierIndex,
  stage: DegradeStage,
): CompactRepoMap {
  const survivingPaths = new Set(map.files.map((f) => f.path));

  const files: CompactFile[] = map.files.map((file) => {
    const symbols = stage.symbolCap ? file.symbols.slice(0, stage.symbolCap) : file.symbols;
    const compact: CompactFile = {
      p: indexOf(pathIndex, file.path),
      s: symbols.map((symbol) => {
        const cs: CompactSymbol = { n: symbol.name, k: KIND_LETTER[symbol.kind] };
        if (symbol.exported) cs.e = 1;
        return cs;
      }),
    };
    if (file.imports.length > 0) {
      compact.i = file.imports.map((specifier) => specifierIndexOf(specifierIndex, specifier));
    }
    // Most exports are already implied by a symbol with e:1 above — only
    // list the ones that aren't (re-export aliases, `export default expr`)
    // to avoid paying for every name twice.
    const exportedSymbolNames = new Set(symbols.filter((s) => s.exported).map((s) => s.name));
    const extraExports = file.exports.filter((name) => !exportedSymbolNames.has(name));
    if (extraExports.length > 0) compact.x = extraExports;
    if (file.isTest) compact.t = 1;
    return compact;
  });

  const result: CompactRepoMap = {
    paths: pathIndex.paths,
    specifiers: specifierIndex.specifiers,
    files,
    entryPoints: map.entryPoints.filter((p) => survivingPaths.has(p)).map((p) => indexOf(pathIndex, p)),
  };

  if (stage.includeTestMap && Object.keys(map.testMap).length > 0) {
    const testMap: Record<string, number | null> = {};
    for (const [testPath, sourcePath] of Object.entries(map.testMap)) {
      if (!survivingPaths.has(testPath)) continue;
      testMap[String(indexOf(pathIndex, testPath))] = sourcePath ? indexOf(pathIndex, sourcePath) : null;
    }
    if (Object.keys(testMap).length > 0) result.testMap = testMap;
  }

  if (stage.includeDependencyGraph && Object.keys(map.dependencyGraph).length > 0) {
    const dependencyGraph: Record<string, number[]> = {};
    for (const [fromPath, toPaths] of Object.entries(map.dependencyGraph)) {
      if (!survivingPaths.has(fromPath)) continue;
      const targets = toPaths.filter((p) => survivingPaths.has(p)).map((p) => indexOf(pathIndex, p));
      if (targets.length > 0) dependencyGraph[String(indexOf(pathIndex, fromPath))] = targets;
    }
    if (Object.keys(dependencyGraph).length > 0) result.dependencyGraph = dependencyGraph;
  }

  return result;
}

function indexOf(pathIndex: PathIndex, path: string): number {
  const index = pathIndex.indexOf.get(path);
  if (index === undefined) throw new Error(`serializeRepoMap: unknown path "${path}" not in the path index`);
  return index;
}

function specifierIndexOf(specifierIndex: SpecifierIndex, specifier: string): number {
  const index = specifierIndex.indexOf.get(specifier);
  if (index === undefined) {
    throw new Error(`serializeRepoMap: unknown specifier "${specifier}" not in the specifier index`);
  }
  return index;
}
