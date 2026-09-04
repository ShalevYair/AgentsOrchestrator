import { basename, dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAgentsDir } from "./agents-dir.js";

describe("resolveAgentsDir", () => {
  it("returns AO_AGENTS_DIR verbatim when set, without touching the filesystem", () => {
    const result = resolveAgentsDir({
      env: { AO_AGENTS_DIR: "/somewhere/custom/agents" },
      moduleUrl: import.meta.url,
    });
    expect(result).toBe("/somewhere/custom/agents");
  });

  it("finds the real repo-root agents/ directory by walking up from this module's own location", () => {
    const result = resolveAgentsDir({ env: {}, moduleUrl: import.meta.url });
    expect(basename(result)).toBe("agents");
    // dirname(result) is the repo root — it really does hold pnpm-workspace.yaml.
    expect(dirname(result)).toBe(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
  });

  describe("with a synthetic workspace tree", () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "ao-agents-dir-test-"));
      writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it("walks up correctly from a shallow caller (mimicking apps/runtime/src/index.ts)", () => {
      const shallow = join(root, "apps", "runtime", "src");
      mkdirSync(shallow, { recursive: true });
      const moduleUrl = pathToFileURL(join(shallow, "index.ts")).toString();
      expect(resolveAgentsDir({ env: {}, moduleUrl })).toBe(join(root, "agents"));
    });

    it("walks up correctly from a deeper caller (mimicking apps/runtime/src/test-support/*.ts)", () => {
      const deep = join(root, "apps", "runtime", "src", "test-support");
      mkdirSync(deep, { recursive: true });
      const moduleUrl = pathToFileURL(join(deep, "build-test-context.ts")).toString();
      expect(resolveAgentsDir({ env: {}, moduleUrl })).toBe(join(root, "agents"));
    });

    it("throws ConfigError when no repo root can be found above the caller", () => {
      const orphan = mkdtempSync(join(tmpdir(), "ao-agents-dir-orphan-"));
      try {
        const moduleUrl = pathToFileURL(join(orphan, "index.ts")).toString();
        expect(() => resolveAgentsDir({ env: {}, moduleUrl })).toThrow(/could not locate the repo root/);
      } finally {
        rmSync(orphan, { recursive: true, force: true });
      }
    });
  });
});
