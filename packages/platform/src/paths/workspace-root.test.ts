import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findWorkspaceRoot } from "./workspace-root.js";

describe("findWorkspaceRoot", () => {
  it("finds the real repo root from this module's own location", () => {
    const root = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
    expect(findWorkspaceRoot(root)).toBe(root);
  });

  describe("with a synthetic workspace tree", () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "ao-workspace-root-test-"));
      writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it("walks up from a shallow directory", () => {
      const shallow = join(root, "apps", "runtime", "src");
      mkdirSync(shallow, { recursive: true });
      expect(findWorkspaceRoot(shallow)).toBe(root);
    });

    it("walks up from a deeper directory", () => {
      const deep = join(root, "apps", "runtime", "src", "test-support");
      mkdirSync(deep, { recursive: true });
      expect(findWorkspaceRoot(deep)).toBe(root);
    });

    it("returns the start directory itself when it already is the root", () => {
      expect(findWorkspaceRoot(root)).toBe(root);
    });

    it("throws ConfigError when no marker exists above the start directory", () => {
      const orphan = mkdtempSync(join(tmpdir(), "ao-workspace-root-orphan-"));
      try {
        expect(() => findWorkspaceRoot(orphan)).toThrow(/could not locate the repo root/);
      } finally {
        rmSync(orphan, { recursive: true, force: true });
      }
    });
  });
});
