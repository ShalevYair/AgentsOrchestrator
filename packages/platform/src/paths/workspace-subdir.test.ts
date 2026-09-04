import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveWorkspaceSubdir } from "./workspace-subdir.js";

let root: string;
let moduleUrl: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ao-workspace-subdir-test-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  const srcDir = join(root, "apps", "evals", "src");
  mkdirSync(srcDir, { recursive: true });
  // The file itself need not exist — fileURLToPath+dirname is pure string
  // manipulation; only the pnpm-workspace.yaml marker above is ever
  // touched by findWorkspaceRoot's existsSync check.
  moduleUrl = pathToFileURL(join(srcDir, "evals-dir.ts")).toString();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("resolveWorkspaceSubdir", () => {
  it("resolves <repo-root>/<dirName> by walking up from moduleUrl", () => {
    expect(resolveWorkspaceSubdir("evals", { moduleUrl })).toBe(join(root, "evals"));
  });

  it("resolves a different dirName from the very same moduleUrl", () => {
    expect(resolveWorkspaceSubdir("recipes", { moduleUrl })).toBe(join(root, "recipes"));
  });

  it("prefers the env var override when set", () => {
    const overridden = resolveWorkspaceSubdir("evals", {
      moduleUrl,
      envVar: "AO_EVALS_DIR",
      env: { AO_EVALS_DIR: "/custom/evals/path" },
    });
    expect(overridden).toBe("/custom/evals/path");
  });

  it("falls through to the workspace-root path when the named env var is unset", () => {
    const resolved = resolveWorkspaceSubdir("evals", {
      moduleUrl,
      envVar: "AO_EVALS_DIR",
      env: {},
    });
    expect(resolved).toBe(join(root, "evals"));
  });

  it("ignores envVar entirely when the caller doesn't pass one", () => {
    const resolved = resolveWorkspaceSubdir("evals", {
      moduleUrl,
      env: { AO_EVALS_DIR: "/should/be/ignored" },
    });
    expect(resolved).toBe(join(root, "evals"));
  });
});
