import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type * as NodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError, isAppError } from "@ao/shared";
import { loadConfig } from "./loader.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ao-config-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("falls back to computed defaults when nothing else is provided", () => {
    const config = loadConfig({ filePath: join(dir, "does-not-exist.json"), env: {} });
    expect(config.logLevel).toBe("info");
    expect(config.locale).toBe("he");
    expect(config.dataDir.length).toBeGreaterThan(0);
  });

  it("layers file over defaults", () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ logLevel: "debug" }));
    const config = loadConfig({ filePath: join(dir, "config.json"), env: {} });
    expect(config.logLevel).toBe("debug");
    expect(config.locale).toBe("he");
  });

  it("parses JSONC — comments and trailing commas are accepted, per config.example.jsonc", () => {
    writeFileSync(
      join(dir, "config.jsonc"),
      ["{", "  // this is a comment", '  "logLevel": "warn",', '  "locale": "en",', "}"].join("\n"),
    );
    const config = loadConfig({ filePath: join(dir, "config.jsonc"), env: {} });
    expect(config.logLevel).toBe("warn");
    expect(config.locale).toBe("en");
  });

  it("layers env over file", () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ logLevel: "debug" }));
    const config = loadConfig({
      filePath: join(dir, "config.json"),
      env: { AO_LOG_LEVEL: "error" },
    });
    expect(config.logLevel).toBe("error");
  });

  it("layers UI overrides over env (highest precedence)", () => {
    const config = loadConfig({
      filePath: join(dir, "missing.json"),
      env: { AO_LOG_LEVEL: "error" },
      uiOverrides: { logLevel: "trace" },
    });
    expect(config.logLevel).toBe("trace");
  });

  it("with no filePath option and no AO_CONFIG_FILE, resolves the file path from dataDir (the real default path)", () => {
    // No filePath override at all — exercises the actual fallthrough a real
    // unconfigured run takes, not just the test-friendly explicit-path form
    // every other test in this file uses.
    const config = loadConfig({ env: {} });
    expect(config.dataDir.length).toBeGreaterThan(0);
    expect(config.logLevel).toBe("info");
  });

  it("wraps a file read failure (e.g. a permissions error) in a ConfigError with the cause preserved", async () => {
    const target = join(dir, "config.json");
    writeFileSync(target, "{}");

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof NodeFs>("node:fs");
      return {
        ...actual,
        readFileSync: (path: string, encoding: BufferEncoding) => {
          if (path === target) {
            throw new Error("EACCES: permission denied");
          }
          return actual.readFileSync(path, encoding);
        },
      };
    });
    vi.resetModules();
    try {
      // Re-imported through a reset module registry, so this loader.js (and
      // its @ao/shared) is a distinct module instance from the one imported
      // at the top of this file — assert on the error's shape, not
      // `instanceof ConfigError`, which would compare across that boundary.
      const { loadConfig: reloadedLoadConfig } = await import("./loader.js");
      try {
        reloadedLoadConfig({ filePath: target, env: {} });
        expect.unreachable("should have thrown");
      } catch (err) {
        const appErr = err as { name: string; code: string; cause?: unknown };
        expect(appErr.name).toBe("ConfigError");
        expect(appErr.code).toBe("CONFIG_INVALID");
        expect(appErr.cause).toBeInstanceOf(Error);
      }
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });

  it("AO_CONFIG_FILE points at an alternate file location", () => {
    const altPath = join(dir, "elsewhere.jsonc");
    writeFileSync(altPath, JSON.stringify({ logLevel: "warn" }));
    const config = loadConfig({ env: { AO_CONFIG_FILE: altPath } });
    expect(config.logLevel).toBe("warn");
  });

  it("throws a ConfigError with a precise, per-field message on invalid config", () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ logLevel: "very-loud" }));
    try {
      loadConfig({ filePath: join(dir, "config.json"), env: {} });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(isAppError(err)).toBe(true);
      expect(err).toBeInstanceOf(ConfigError);
      const configErr = err as ConfigError;
      expect(configErr.message).toContain("logLevel");
      expect(configErr.code).toBe("CONFIG_INVALID");
    }
  });

  it("throws a ConfigError when the config file is not valid JSON/JSONC", () => {
    writeFileSync(join(dir, "config.json"), "{ this is not json");
    expect(() => loadConfig({ filePath: join(dir, "config.json"), env: {} })).toThrow(ConfigError);
  });

  it("throws a ConfigError when the config file is a JSON array instead of an object", () => {
    writeFileSync(join(dir, "config.json"), "[1, 2, 3]");
    expect(() => loadConfig({ filePath: join(dir, "config.json"), env: {} })).toThrow(ConfigError);
  });

  it("rejects an unknown config key (strict schema catches typos)", () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ logLevell: "info" }));
    expect(() => loadConfig({ filePath: join(dir, "config.json"), env: {} })).toThrow(ConfigError);
  });
});
