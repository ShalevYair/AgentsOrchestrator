import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCodeValidation, type CommandResult, type RunCommand } from "./code-validate.js";

const execFileAsync = promisify(execFile);

describe("runCodeValidation (fake runner)", () => {
  it("passes when every check exits 0", async () => {
    const runCommand: RunCommand = () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    const result = await runCodeValidation({
      runCommand,
      cwd: "/tmp/project",
      checks: [
        { kind: "typecheck", command: "tsc", args: ["--noEmit"] },
        { kind: "test", command: "vitest", args: ["run"] },
      ],
    });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("records a violation with parsed file paths for a tsc-shaped failure, without touching passing checks", async () => {
    const runCommand: RunCommand = (command): Promise<CommandResult> => {
      if (command === "tsc") {
        return Promise.resolve({
          exitCode: 2,
          stdout:
            "src/foo.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/bar.ts(3,1): error TS2304: Cannot find name \"X\".",
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    };

    const result = await runCodeValidation({
      runCommand,
      cwd: "/tmp/project",
      checks: [
        { kind: "typecheck", command: "tsc", args: ["--noEmit"] },
        { kind: "test", command: "vitest", args: ["run"] },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("typecheck");
    expect(result.violations[0]?.filePaths.sort()).toEqual(["src/bar.ts", "src/foo.ts"]);
  });

  it("parses eslint-shaped `path:line:col` output too", async () => {
    const runCommand: RunCommand = () =>
      Promise.resolve({
        exitCode: 1,
        stdout: "src/app.ts:10:3  error  'x' is defined but never used  no-unused-vars",
        stderr: "",
      });
    const result = await runCodeValidation({
      runCommand,
      cwd: "/tmp/project",
      checks: [{ kind: "lint", command: "eslint", args: ["."] }],
    });
    expect(result.violations[0]?.filePaths).toEqual(["src/app.ts"]);
  });

  it("still records a violation (with no parsed paths) when the failing output matches neither known shape", async () => {
    const runCommand: RunCommand = () => Promise.resolve({ exitCode: 1, stdout: "boom", stderr: "" });
    const result = await runCodeValidation({
      runCommand,
      cwd: "/tmp/project",
      checks: [{ kind: "test", command: "vitest", args: ["run"] }],
    });
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.filePaths).toHaveLength(0);
    expect(result.violations[0]?.detail).toContain("boom");
  });
});

describe("runCodeValidation (real tsc, real fixture on disk)", () => {
  let dir: string;
  const tscBin = resolve(fileURLToPath(new URL("../../../../", import.meta.url)), "node_modules/.bin/tsc");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ao-code-validate-"));
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, module: "commonjs", target: "es2020" },
      }),
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const realRunCommand: RunCommand = async (command, args, cwd) => {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, { cwd });
      return { exitCode: 0, stdout, stderr };
    } catch (error) {
      const err = error as { code?: number; stdout?: string; stderr?: string };
      return { exitCode: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
    }
  };

  it("passes against a real, valid TypeScript file", async () => {
    writeFileSync(join(dir, "ok.ts"), "export const answer: number = 42;\n");

    const result = await runCodeValidation({
      runCommand: realRunCommand,
      cwd: dir,
      checks: [{ kind: "typecheck", command: tscBin, args: [] }],
    });

    expect(result.passed).toBe(true);
  }, 30_000);

  it("catches a real type error via the actual installed tsc binary, with the real file path parsed out", async () => {
    writeFileSync(join(dir, "broken.ts"), "export const answer: number = 'not a number';\n");

    const result = await runCodeValidation({
      runCommand: realRunCommand,
      cwd: dir,
      checks: [{ kind: "typecheck", command: tscBin, args: [] }],
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.filePaths).toEqual(["broken.ts"]);
    expect(result.violations[0]?.detail).toContain("TS2322");
  }, 30_000);
});
