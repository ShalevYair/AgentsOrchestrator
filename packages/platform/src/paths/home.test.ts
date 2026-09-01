import { homedir } from "node:os";
import { sep } from "node:path";
import { describe, expect, it } from "vitest";
import { expandHome } from "./home.js";

describe("expandHome", () => {
  it("expands a bare ~ to the home directory", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  it("expands ~/... to <home>/...", () => {
    expect(expandHome("~/.agents-orchestrator")).toBe(`${homedir()}/.agents-orchestrator`);
  });

  it("expands a Windows-style ~\\... path", () => {
    expect(expandHome("~\\.agents-orchestrator")).toBe(`${homedir()}\\.agents-orchestrator`);
  });

  it("leaves an already-absolute path untouched", () => {
    const absolute = `${sep}var${sep}data`;
    expect(expandHome(absolute)).toBe(absolute);
  });

  it("leaves a path that merely contains a tilde elsewhere untouched", () => {
    expect(expandHome("data~backup")).toBe("data~backup");
  });
});
