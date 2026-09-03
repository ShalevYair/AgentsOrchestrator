import { describe, expect, it } from "vitest";
import { classifyArtifactViewer, formatBytes, shikiLangFor } from "./artifact-kind.js";

describe("classifyArtifactViewer", () => {
  it.each([
    ["README.md", "markdown"],
    ["notes.markdown", "markdown"],
    ["bundle.zip", "zip"],
    ["logo.png", "image"],
    ["photo.JPG", "image"],
    ["data.csv", "table"],
    ["data.tsv", "table"],
    ["index.ts", "code"],
    ["main.py", "code"],
    ["config.json", "code"],
    ["unknown.xyz", "text"],
    ["no-extension", "text"],
  ])("classifies %s as %s", (filename, expected) => {
    expect(classifyArtifactViewer(filename)).toBe(expected);
  });
});

describe("shikiLangFor", () => {
  it("maps common aliases to their Shiki language id", () => {
    expect(shikiLangFor("a.mjs")).toBe("js");
    expect(shikiLangFor("a.htm")).toBe("html");
  });

  it("falls back to the raw extension for anything not aliased", () => {
    expect(shikiLangFor("a.rs")).toBe("rs");
  });

  it("falls back to text for no extension", () => {
    expect(shikiLangFor("Makefile")).toBe("text");
  });
});

describe("formatBytes", () => {
  it("shows raw bytes under 1KB", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("shows KB with one decimal under 10", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("shows whole numbers at 10 and above", () => {
    expect(formatBytes(15 * 1024)).toBe("15 KB");
  });

  it("scales up to MB", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
