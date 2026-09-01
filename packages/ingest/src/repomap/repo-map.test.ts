import { describe, expect, it } from "vitest";
import { buildRepoMap, type RepoMapInput } from "./repo-map.js";
import { serializeRepoMap } from "./serialize.js";

describe("buildRepoMap", () => {
  it("extracts exported and unexported top-level symbols with their kind", async () => {
    const inputs: RepoMapInput[] = [
      {
        path: "src/auth.ts",
        text: `export function login(user: string): boolean { return user.length > 0; }
class InternalHelper {}
export class AuthGuard {}
export interface Session { token: string; }
export type Role = "admin" | "user";
export enum Status { Active, Inactive }
export const DEFAULT_TIMEOUT = 30;
const secret = "shh";
`,
      },
    ];

    const map = await buildRepoMap(inputs);
    const file = map.files[0];
    expect(file).toBeDefined();
    const byName = new Map(file?.symbols.map((s) => [s.name, s]));

    expect(byName.get("login")).toMatchObject({ kind: "function", exported: true });
    expect(byName.get("InternalHelper")).toMatchObject({ kind: "class", exported: false });
    expect(byName.get("AuthGuard")).toMatchObject({ kind: "class", exported: true });
    expect(byName.get("Session")).toMatchObject({ kind: "interface", exported: true });
    expect(byName.get("Role")).toMatchObject({ kind: "type", exported: true });
    expect(byName.get("Status")).toMatchObject({ kind: "enum", exported: true });
    expect(byName.get("DEFAULT_TIMEOUT")).toMatchObject({ kind: "const", exported: true });
    expect(byName.get("secret")).toMatchObject({ kind: "const", exported: false });
  });

  it("records import specifiers and export names, including re-exports and default", async () => {
    const inputs: RepoMapInput[] = [
      {
        path: "src/index.ts",
        text: `import { helper } from "./helper";
import defaultThing from "external-pkg";
export function main() {}
export default main;
export { helper as reexportedHelper };
export { other } from "./other";
`,
      },
    ];

    const map = await buildRepoMap(inputs);
    const file = map.files[0];
    expect(file?.imports).toEqual(expect.arrayContaining(["./helper", "external-pkg", "./other"]));
    expect(file?.exports).toEqual(expect.arrayContaining(["main", "default", "reexportedHelper", "other"]));
  });

  it("resolves relative imports into a dependency graph, ignoring bare specifiers", async () => {
    const inputs: RepoMapInput[] = [
      {
        path: "src/a.ts",
        text: `import { b } from "./b";\nimport fs from "node:fs";\nexport const useB = b;`,
      },
      { path: "src/b.ts", text: `export const b = 1;` },
    ];

    const map = await buildRepoMap(inputs);
    expect(map.dependencyGraph["src/a.ts"]).toEqual(["src/b.ts"]);
    expect(map.dependencyGraph["src/b.ts"]).toBeUndefined();
  });

  it("resolves imports to an index file when the specifier is a directory", async () => {
    const inputs: RepoMapInput[] = [
      { path: "src/a.ts", text: `import { thing } from "./lib";\nexport const x = thing;` },
      { path: "src/lib/index.ts", text: `export const thing = 1;` },
    ];
    const map = await buildRepoMap(inputs);
    expect(map.dependencyGraph["src/a.ts"]).toEqual(["src/lib/index.ts"]);
  });

  it("detects a package.json main field as an entry point", async () => {
    const inputs: RepoMapInput[] = [
      { path: "package.json", text: JSON.stringify({ main: "./src/index.ts" }) },
      { path: "src/index.ts", text: `export const app = 1;` },
    ];
    const map = await buildRepoMap(inputs);
    expect(map.entryPoints).toContain("src/index.ts");
  });

  it("falls back to src/index.ts when package.json points at unresolvable dist output", async () => {
    const inputs: RepoMapInput[] = [
      { path: "package.json", text: JSON.stringify({ main: "./dist/index.js" }) },
      { path: "src/index.ts", text: `export const app = 1;` },
    ];
    const map = await buildRepoMap(inputs);
    expect(map.entryPoints).toContain("src/index.ts");
  });

  it("builds a test map from .test.ts files to their guessed source", async () => {
    const inputs: RepoMapInput[] = [
      { path: "src/auth.ts", text: `export function login() {}` },
      { path: "src/auth.test.ts", text: `import { login } from "./auth";\nlogin();` },
      { path: "src/orphan.test.ts", text: `test("x", () => {});` },
    ];
    const map = await buildRepoMap(inputs);
    expect(map.testMap["src/auth.test.ts"]).toBe("src/auth.ts");
    expect(map.testMap["src/orphan.test.ts"]).toBeNull();
  });

  it("ignores non-code files (they simply produce no FileMap entry)", async () => {
    const inputs: RepoMapInput[] = [
      { path: "README.md", text: "# Hello" },
      { path: "src/a.ts", text: "export const a = 1;" },
    ];
    const map = await buildRepoMap(inputs);
    expect(map.files.map((f) => f.path)).toEqual(["src/a.ts"]);
  });
});

describe("buildRepoMap — scale (P3-T5 done criterion)", () => {
  it("maps a medium TS repo (1000 files) in under 10s, serialized under 40K tokens", async () => {
    const fileCount = 1000;
    const inputs: RepoMapInput[] = [];
    for (let i = 0; i < fileCount; i++) {
      const importFrom = i > 0 ? `import { helper${String(i - 1)} } from "./mod${String(i - 1)}";\n` : "";
      inputs.push({
        path: `src/mod${String(i)}.ts`,
        text: `${importFrom}export function helper${String(i)}(x: number): number {
  return x + ${String(i)};
}

export interface Options${String(i)} {
  verbose: boolean;
}

const internal${String(i)} = ${String(i)};
`,
      });
      if (i % 5 === 0) {
        inputs.push({
          path: `src/mod${String(i)}.test.ts`,
          text: `import { helper${String(i)} } from "./mod${String(i)}";\ntest("works", () => helper${String(i)}(1));`,
        });
      }
    }
    inputs.push({ path: "package.json", text: JSON.stringify({ main: "./src/mod0.ts" }) });

    const start = Date.now();
    const map = await buildRepoMap(inputs);
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(10_000);
    expect(map.files.length).toBe(fileCount + Math.ceil(fileCount / 5));

    // This corpus is an adversarial stress case, not a "typical" medium
    // repo: every single file imports the one before it, so the
    // dependency graph alone is ~1000 edges — denser than most real
    // repos, where most files share a handful of common utility/type
    // imports rather than each pointing at a distinct neighbor.
    // serializeRepoMap's job is to *never* exceed the budget regardless,
    // degrading (and reporting what it dropped) rather than emitting an
    // oversized blob — so the hard requirement here is the token
    // ceiling, with a floor on how much useful content survives.
    const serialized = serializeRepoMap(map);
    expect(serialized.estimatedTokens).toBeLessThanOrEqual(40_000);
    const parsed = JSON.parse(serialized.text) as { files: unknown[] };
    expect(parsed.files.length).toBeGreaterThan(map.files.length * 0.5);
  }, 30_000);

  it("does not truncate a realistically sparse medium repo", async () => {
    // A more representative shape: most files import from a small shared
    // set (2-3 common modules) rather than a unique neighbor each, which
    // is what keeps a real dependency graph small relative to file count.
    const fileCount = 1000;
    const inputs: RepoMapInput[] = [
      { path: "src/shared/types.ts", text: `export interface Base { id: string; }` },
      { path: "src/shared/utils.ts", text: `export function util(x: number): number { return x; }` },
    ];
    for (let i = 0; i < fileCount; i++) {
      inputs.push({
        path: `src/mod${String(i)}.ts`,
        text: `import type { Base } from "./shared/types";
import { util } from "./shared/utils";
export function handler${String(i)}(x: Base): number {
  return util(${String(i)});
}
`,
      });
    }

    const map = await buildRepoMap(inputs);
    const serialized = serializeRepoMap(map);
    expect(serialized.estimatedTokens).toBeLessThan(40_000);
    expect(serialized.truncated).toBe(false);
    const parsed = JSON.parse(serialized.text) as { files: unknown[] };
    expect(parsed.files.length).toBe(map.files.length);
  });
});
