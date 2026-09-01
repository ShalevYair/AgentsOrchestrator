import type { ModelInfo } from "@ao/shared";
import { describe, expect, it } from "vitest";
import {
  CHEAP_FALLBACK_MODEL_ID,
  MODEL_REGISTRY,
  WORKER_MODEL_ID,
  parseModelVersion,
  resolveModelEntry,
  selectCheapModel,
  validateModelRegistry,
} from "./models.js";

function liveModel(overrides: Partial<ModelInfo> & { id: string }): ModelInfo {
  return {
    displayName: overrides.id,
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 8_000,
    supportsGenerate: true,
    supportsCountTokens: true,
    supportsCaching: false,
    supportsThinking: true,
    ...overrides,
  };
}

describe("MODEL_REGISTRY", () => {
  it("is the single source for the pinned worker model id", () => {
    expect(WORKER_MODEL_ID).toBe("gemini-3.7-flash");
    expect(resolveModelEntry(WORKER_MODEL_ID)?.tierCandidate).toBe("worker");
  });

  it("every entry carries dated, sourced pricing (never asserted without a verifiedOn/source)", () => {
    for (const entry of MODEL_REGISTRY) {
      expect(entry.pricing.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.pricing.source.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveModelEntry", () => {
  it("returns undefined for an id not in the registry", () => {
    expect(resolveModelEntry("not-a-real-model")).toBeUndefined();
  });
});

describe("parseModelVersion", () => {
  it("extracts a numeric version from a dated model id", () => {
    expect(parseModelVersion("gemini-3.1-flash-lite")).toBe(3.1);
    expect(parseModelVersion("gemini-2.5-flash-lite")).toBe(2.5);
    expect(parseModelVersion("gemini-3.7-flash")).toBe(3.7);
  });

  it("returns null for an undated alias or unrecognized id", () => {
    expect(parseModelVersion("gemini-flash-lite-latest")).toBeNull();
    expect(parseModelVersion("not-gemini-at-all")).toBeNull();
  });
});

describe("selectCheapModel", () => {
  it("falls back to the static alias, with source=static-fallback, when no live catalog is available", () => {
    expect(selectCheapModel(null)).toEqual({ modelId: CHEAP_FALLBACK_MODEL_ID, source: "static-fallback" });
    expect(selectCheapModel(undefined)).toEqual({
      modelId: CHEAP_FALLBACK_MODEL_ID,
      source: "static-fallback",
    });
    expect(selectCheapModel([])).toEqual({ modelId: CHEAP_FALLBACK_MODEL_ID, source: "static-fallback" });
  });

  it("falls back to the static alias when the live catalog has no Flash-Lite-class model", () => {
    const live = [liveModel({ id: "gemini-3.7-flash" }), liveModel({ id: "gemini-3.1-pro-preview" })];
    expect(selectCheapModel(live)).toEqual({ modelId: CHEAP_FALLBACK_MODEL_ID, source: "static-fallback" });
  });

  it("picks the highest-versioned live Flash-Lite-class model — never a pinned id (DECISIONS.md Q5)", () => {
    const live = [
      liveModel({ id: "gemini-2.5-flash-lite" }),
      liveModel({ id: "gemini-3.1-flash-lite" }),
      liveModel({ id: "gemini-3.7-flash" }),
    ];
    expect(selectCheapModel(live)).toEqual({ modelId: "gemini-3.1-flash-lite", source: "live" });
  });

  it("prefers a dated live candidate over an undated alias also present in the live catalog", () => {
    const live = [liveModel({ id: "gemini-flash-lite-latest" }), liveModel({ id: "gemini-2.5-flash-lite" })];
    expect(selectCheapModel(live)).toEqual({ modelId: "gemini-2.5-flash-lite", source: "live" });
  });

  it("a newly-released, higher-versioned lite model automatically wins over yesterday's pick — proving the selection is genuinely dynamic", () => {
    const before = selectCheapModel([liveModel({ id: "gemini-3.1-flash-lite" })]);
    const after = selectCheapModel([
      liveModel({ id: "gemini-3.1-flash-lite" }),
      liveModel({ id: "gemini-4.0-flash-lite" }),
    ]);
    expect(before.modelId).toBe("gemini-3.1-flash-lite");
    expect(after.modelId).toBe("gemini-4.0-flash-lite");
  });
});

describe("validateModelRegistry", () => {
  it("reports ok with no missing ids when the live catalog contains every non-fallback registry entry", () => {
    const live = [liveModel({ id: WORKER_MODEL_ID })];
    const result = validateModelRegistry(live);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("degrades to a warning list — never throws — when a registered model has disappeared from the live catalog", () => {
    const result = validateModelRegistry([liveModel({ id: "gemini-9.9-flash" })]);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain(WORKER_MODEL_ID);
  });

  it("never flags the unverifiedFallback alias entry as missing (it's not expected to appear literally in models.list)", () => {
    const result = validateModelRegistry([liveModel({ id: WORKER_MODEL_ID })]);
    expect(result.missing).not.toContain(CHEAP_FALLBACK_MODEL_ID);
  });
});
