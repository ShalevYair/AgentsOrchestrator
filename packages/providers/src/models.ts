import type { AgentTier, ModelInfo } from "@ao/shared";

/**
 * P1-T7 — the ONE model table. No other file in this package may hardcode
 * a Gemini model id string; everything reads from here.
 *
 * **What was and wasn't independently verified**, live, while building
 * this (see the P1 report for the full account): `ai.google.dev` and
 * `googleapis.github.io` are both blocked by this sandbox's egress proxy,
 * so the primary Gemini pricing/model docs could not be fetched directly.
 * What *was* verified:
 *  - `gemini-3.7-flash`'s existence, as a literal in the installed
 *    `@google/genai@2.20.0` SDK's own model-id union type (`Model_2` in
 *    `node_modules/@google/genai/dist/genai.d.ts`) — that union also lists
 *    `gemini-3.1-flash-lite`, `gemini-flash-lite-latest`, and
 *    `gemini-flash-latest`/`gemini-pro-latest` as of the SDK version
 *    resolved live from the npm registry (2.20.0) while this was built.
 *  - Pricing for `gemini-3.7-flash` ($0.75/$3.75 per 1M input/output
 *    tokens, introductory through 2026-12-31, doubling to $1.50/$7.50
 *    after) via web search cross-referencing multiple independent
 *    secondary sources (datacamp.com, venturebeat.com's launch coverage,
 *    openrouter.ai's pricing listing) — consistent with README.md's own
 *    pricing table, which states the same figures and the same caveat
 *    that they must be re-verified rather than trusted from that table.
 *  - The 1M-token input / 64K-token output limits for `gemini-3.7-flash`,
 *    consistent across README.md, ADR-009, and the web search results
 *    above.
 *
 * What was **not** independently confirmed against a primary source (and
 * is marked as such below): the exact context/output limits for any
 * Flash-Lite-class model, and the 4096-token minimum for explicit context
 * caching. Both are exactly the kind of data `validateModelRegistry` /
 * `selectCheapModel` are designed to refresh from the live
 * `LLMProvider.models()` catalog rather than trust statically — the static
 * numbers here exist only as the last-resort fallback for when that live
 * catalog is unavailable, which is this environment's actual situation
 * (no `GEMINI_API_KEY` configured).
 */

export interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cachedInputPerMillionUsd?: number;
  /** ISO date this price was actually checked — not carried over from memory. */
  verifiedOn: string;
  /** Where it was checked, and any caveat about how reliable that source is. */
  source: string;
}

export interface ModelCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  contextCaching: boolean;
  thinking: boolean;
  /** Batch API is explicitly a later phase per ARCHITECTURE.md §7 ("שלב מאוחר") — always false in P1, not a claim about the model itself. */
  batchApi: boolean;
}

export interface ModelRegistryEntry {
  id: string;
  displayName: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  capabilities: ModelCapabilities;
  pricing: ModelPricing;
  /** Minimum tokens required to create an explicit context cache, when known (undefined = unknown, don't assume). */
  minCacheTokens?: number;
  /** What this entry is a *candidate* for. `tier.cheap`'s actual pick is dynamic (DECISIONS.md Q5) — see selectCheapModel; this is not a pin. */
  tierCandidate: AgentTier;
  /** True for a static, best-effort fallback entry (used only when the live catalog is unavailable) rather than a value checked against a primary source. */
  unverifiedFallback?: boolean;
}

const RESEARCH_DATE = "2026-09-01";

/** ADR-009's pinned worker model — the one deliberately-hardcoded id in this package, and it lives here. */
export const WORKER_MODEL_ID = "gemini-3.7-flash";

/** Rolling alias Google maintains for "the current recommended Flash-Lite model" — the last-resort static fallback for tier.cheap. */
export const CHEAP_FALLBACK_MODEL_ID = "gemini-flash-lite-latest";

/**
 * ADR-009 leaves `tier.synth` explicitly configurable ("Flash / Pro").
 * Defaulting it to the same pinned worker model is the only choice that
 * doesn't require asserting unverified pricing/limits for a Pro-class
 * model; a later phase (P4's budget engine) can make this an actual
 * config knob.
 */
export const DEFAULT_SYNTH_MODEL_ID = WORKER_MODEL_ID;

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = [
  {
    id: WORKER_MODEL_ID,
    displayName: "Gemini 3.7 Flash",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 64_000,
    capabilities: {
      streaming: true,
      structuredOutput: true,
      contextCaching: true,
      thinking: true,
      batchApi: false,
    },
    pricing: {
      inputPerMillionUsd: 0.75,
      outputPerMillionUsd: 3.75,
      verifiedOn: RESEARCH_DATE,
      source:
        "Web search cross-referencing datacamp.com/blog/gemini-3-7-flash, venturebeat.com launch " +
        "coverage, and openrouter.ai's pricing listing (introductory price through 2026-12-31, " +
        "doubling to $1.50/$7.50 on 2027-01-01) — consistent with README.md's own table. " +
        "ai.google.dev itself was unreachable from this sandbox's egress proxy.",
    },
    minCacheTokens: 4096,
    tierCandidate: "worker",
  },
  {
    id: CHEAP_FALLBACK_MODEL_ID,
    displayName: "Gemini Flash-Lite (rolling alias)",
    // Conservative placeholder limits, NOT independently verified for whatever
    // model this alias currently points to — see the file-level doc comment.
    // Real limits always come from the live models.list() entry when available.
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 8_000,
    capabilities: {
      streaming: true,
      structuredOutput: true,
      contextCaching: false,
      thinking: true,
      batchApi: false,
    },
    pricing: {
      inputPerMillionUsd: 0.3,
      outputPerMillionUsd: 2.5,
      verifiedOn: RESEARCH_DATE,
      source:
        "Approximate — tracks gemini-3.5-flash-lite's reported pricing from web search (morphllm.com, " +
        "cloudprice.net) at research time, but this row is an ALIAS whose target model can change " +
        "without notice; treat these numbers as indicative only, never as a committed price.",
    },
    tierCandidate: "cheap",
    unverifiedFallback: true,
  },
];

export function resolveModelEntry(id: string): ModelRegistryEntry | undefined {
  return MODEL_REGISTRY.find((entry) => entry.id === id);
}

/**
 * Extracts a comparable version number from a dated Gemini model id, e.g.
 * `"gemini-3.1-flash-lite"` -> 3.1, `"gemini-2.5-flash-lite"` -> 2.5.
 * Returns null for an undated alias (`"gemini-flash-lite-latest"`) or
 * anything that doesn't match the pattern — those sort last, since an
 * alias's actual freshness can't be compared numerically.
 */
export function parseModelVersion(id: string): number | null {
  const match = /^gemini-(\d+(?:\.\d+)?)-/.exec(id);
  if (!match?.[1]) return null;
  const version = Number.parseFloat(match[1]);
  return Number.isFinite(version) ? version : null;
}

const FLASH_LITE_PATTERN = /flash-lite/i;

export interface CheapModelSelection {
  modelId: string;
  /** "live" = picked from an actual models.list() catalog; "static-fallback" = the live catalog was unavailable or had no match. */
  source: "live" | "static-fallback";
}

/**
 * Dynamic `tier.cheap` selection (DECISIONS.md Q5): never a pinned id.
 * Picks the highest-versioned Flash-Lite-class model from the live
 * catalog; falls back to the static registry's alias entry — gracefully,
 * with the caller able to see and log that it happened — when no live
 * catalog is available (this sandbox's actual situation, with no
 * `GEMINI_API_KEY` configured) or it contains no Flash-Lite-class model.
 */
export function selectCheapModel(liveModels: readonly ModelInfo[] | null | undefined): CheapModelSelection {
  const candidates = (liveModels ?? []).filter((m) => FLASH_LITE_PATTERN.test(m.id));
  if (candidates.length === 0) {
    return { modelId: CHEAP_FALLBACK_MODEL_ID, source: "static-fallback" };
  }
  const dated = candidates
    .map((m) => ({ model: m, version: parseModelVersion(m.id) }))
    .filter((c): c is { model: ModelInfo; version: number } => c.version !== null)
    .sort((a, b) => b.version - a.version);
  if (dated.length > 0) {
    const best = dated[0];
    if (best) return { modelId: best.model.id, source: "live" };
  }
  // Only undated aliases matched — still a live, real catalog entry, just not comparable by version.
  const first = candidates[0];
  return { modelId: first ? first.id : CHEAP_FALLBACK_MODEL_ID, source: first ? "live" : "static-fallback" };
}

export interface ModelRegistryValidation {
  /** Registry ids not present in the live catalog — each needs a warning, never a crash (P1-T7's "גמור" criterion). */
  missing: string[];
  ok: boolean;
}

/** Validates the static registry against a live catalog, per P1-T7. Never throws — degrades to a warning list. */
export function validateModelRegistry(liveModels: readonly ModelInfo[]): ModelRegistryValidation {
  const liveIds = new Set(liveModels.map((m) => m.id));
  const missing = MODEL_REGISTRY.filter((entry) => !entry.unverifiedFallback && !liveIds.has(entry.id)).map(
    (entry) => entry.id,
  );
  return { missing, ok: missing.length === 0 };
}
