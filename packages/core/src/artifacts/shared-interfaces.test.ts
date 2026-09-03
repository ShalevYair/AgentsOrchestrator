import { describe, expect, it } from "vitest";
import type { AssembledFile } from "../parse/index.js";
import { buildContractBlockAddendum, detectSharedInterfaceViolations } from "./shared-interfaces.js";

function file(path: string, data: string): AssembledFile {
  return {
    id: path,
    path,
    op: "create",
    encoding: "utf8",
    data,
    sha256: "a".repeat(64),
    lines: data.split("\n").length,
  };
}

const SHARED = file(
  "src/types.ts",
  [
    "export interface User {",
    "  id: string;",
    "  name: string;",
    "}",
    "",
    "export type UserId = string;",
  ].join("\n"),
);

describe("detectSharedInterfaceViolations", () => {
  it("flags nothing when every consumer imports the shared symbols and never redefines them", () => {
    const consumer = file(
      "src/service.ts",
      [
        'import type { User, UserId } from "./types.js";',
        "",
        "export function greet(u: User): UserId {",
        "  return u.id;",
        "}",
      ].join("\n"),
    );
    expect(detectSharedInterfaceViolations(SHARED, [SHARED, consumer])).toHaveLength(0);
  });

  it("flags a file that redefines a symbol the shared file already declares", () => {
    const consumer = file(
      "src/other.ts",
      [
        "export interface User {",
        "  id: string;",
        "}",
        "",
        "export function whoAmI(): User {",
        '  return { id: "x" };',
        "}",
      ].join("\n"),
    );
    const violations = detectSharedInterfaceViolations(SHARED, [SHARED, consumer]);
    expect(violations).toContainEqual({ kind: "redefined-symbol", symbol: "User", filePath: "src/other.ts" });
  });

  it("flags a file that uses a shared symbol without importing it", () => {
    const consumer = file(
      "src/broken.ts",
      ["export function greet(u: User): string {", "  return u.name;", "}"].join("\n"),
    );
    const violations = detectSharedInterfaceViolations(SHARED, [SHARED, consumer]);
    expect(violations).toContainEqual({ kind: "missing-import", symbol: "User", filePath: "src/broken.ts" });
  });

  it("does not flag a file that never touches any shared symbol at all", () => {
    const consumer = file(
      "src/unrelated.ts",
      ["export function add(a: number, b: number): number {", "  return a + b;", "}"].join("\n"),
    );
    expect(detectSharedInterfaceViolations(SHARED, [SHARED, consumer])).toHaveLength(0);
  });

  it("never flags the shared file against itself", () => {
    expect(detectSharedInterfaceViolations(SHARED, [SHARED])).toHaveLength(0);
  });

  it("reports one violation per (symbol, file) pair when multiple shared symbols are involved", () => {
    const consumer = file(
      "src/two-redefines.ts",
      ["export interface User {}", "export type UserId = number;"].join("\n"),
    );
    const violations = detectSharedInterfaceViolations(SHARED, [SHARED, consumer]);
    expect(violations.filter((v) => v.kind === "redefined-symbol")).toHaveLength(2);
  });
});

describe("buildContractBlockAddendum", () => {
  it("labels the block as import-only and includes the shared file's own path and content", () => {
    const text = buildContractBlockAddendum(SHARED);
    expect(text).toContain("src/types.ts");
    expect(text).toContain("interface User");
    expect(text).toContain("ייבאו ממנו");
  });
});
