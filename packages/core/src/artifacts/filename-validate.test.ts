import { describe, expect, it } from "vitest";
import { MAX_ARTIFACT_PATH_LENGTH, validateArtifactPath } from "./filename-validate.js";

describe("validateArtifactPath — valid paths", () => {
  it("accepts an ordinary nested path", () => {
    expect(validateArtifactPath("src/components/Button.tsx")).toEqual({ valid: true, violations: [] });
  });

  it("accepts a path with dots inside a normal filename", () => {
    expect(validateArtifactPath("README.v2.md").valid).toBe(true);
  });
});

// The "corpus of problematic names" P8-T6 asks for — every entry here is
// pure string logic with no OS branch, so this suite is representative of
// Windows/macOS behavior even though it only physically runs on Linux here.
describe("validateArtifactPath — Windows-reserved names, any platform", () => {
  it.each(["con", "CON", "prn", "aux", "nul", "com1", "COM9", "lpt1", "LPT9", "aux.ts", "Nul.config.json"])(
    "rejects reserved device name %s",
    (name) => {
      const result = validateArtifactPath(`src/${name}`);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.kind === "reserved-name")).toBe(true);
    },
  );

  it("does not flag a name that merely starts with a reserved prefix", () => {
    // "console.ts" is not "con" — must not false-positive on prefix match.
    expect(validateArtifactPath("src/console.ts").valid).toBe(true);
  });

  it("a reserved name nested deep in the path is still caught", () => {
    const result = validateArtifactPath("a/b/c/nul.ts");
    expect(result.valid).toBe(false);
    expect(result.violations[0]?.segment).toBe("nul.ts");
  });
});

describe("validateArtifactPath — forbidden characters", () => {
  it.each(["a<b.ts", "a>b.ts", "a:b.ts", 'a"b.ts', "a|b.ts", "a?b.ts", "a*b.ts"])("rejects %s", (name) => {
    const result = validateArtifactPath(name);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === "forbidden-character")).toBe(true);
  });

  it("rejects a control byte in the name", () => {
    const result = validateArtifactPath("a\x01b.ts");
    expect(result.violations.some((v) => v.kind === "forbidden-character")).toBe(true);
  });
});

describe("validateArtifactPath — trailing dot or space", () => {
  it("rejects a segment ending in a dot", () => {
    expect(validateArtifactPath("src/notes.").valid).toBe(false);
  });

  it("rejects a segment ending in a space", () => {
    expect(validateArtifactPath("src/notes ").valid).toBe(false);
  });

  it("does not reject a dot in the middle of a segment", () => {
    expect(validateArtifactPath("src/notes.txt").valid).toBe(true);
  });
});

describe("validateArtifactPath — path length", () => {
  it("rejects a path over the 260-character limit", () => {
    const longName = `${"a".repeat(MAX_ARTIFACT_PATH_LENGTH)}.ts`;
    const result = validateArtifactPath(longName);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.kind === "path-too-long")).toBe(true);
  });

  it("accepts a path exactly at the limit", () => {
    const exact = "a".repeat(MAX_ARTIFACT_PATH_LENGTH);
    expect(validateArtifactPath(exact).valid).toBe(true);
  });
});

describe("validateArtifactPath — suggestedPath never crashes, always offers an alternative", () => {
  it("suggests a fixed name for a reserved device name", () => {
    const result = validateArtifactPath("src/aux.ts");
    expect(result.valid).toBe(false);
    expect(result.suggestedPath).toBe("src/aux_file.ts");
    expect(validateArtifactPath(result.suggestedPath!).valid).toBe(true); // the suggestion itself must be valid
  });

  it("suggests forbidden characters replaced with underscores", () => {
    const result = validateArtifactPath("src/a<b>c.ts");
    expect(result.suggestedPath).toBe("src/a_b_c.ts");
    expect(validateArtifactPath(result.suggestedPath!).valid).toBe(true);
  });

  it("suggests trailing dot/space trimmed", () => {
    const result = validateArtifactPath("src/notes. ");
    expect(result.suggestedPath).toBe("src/notes");
    expect(validateArtifactPath(result.suggestedPath!).valid).toBe(true);
  });

  it("suggests a truncated path when over the length limit, preserving the extension", () => {
    const longName = `${"a".repeat(MAX_ARTIFACT_PATH_LENGTH)}.ts`;
    const result = validateArtifactPath(longName);
    expect(result.suggestedPath!.length).toBeLessThanOrEqual(MAX_ARTIFACT_PATH_LENGTH);
    expect(result.suggestedPath!.endsWith(".ts")).toBe(true);
    expect(validateArtifactPath(result.suggestedPath!).valid).toBe(true);
  });

  it("combines multiple violations in one segment (forbidden char + trailing space) into one working suggestion", () => {
    const result = validateArtifactPath("src/a<b.ts ");
    expect(result.valid).toBe(false);
    expect(result.violations.map((v) => v.kind).sort()).toEqual([
      "forbidden-character",
      "trailing-dot-or-space",
    ]);
    expect(result.suggestedPath).toBe("src/a_b.ts");
    expect(validateArtifactPath(result.suggestedPath!).valid).toBe(true);
  });
});
