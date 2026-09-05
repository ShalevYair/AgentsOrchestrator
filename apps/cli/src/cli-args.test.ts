import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli-args.js";

describe("parseArgs", () => {
  it("defaults to open:true and no port/host override", () => {
    expect(parseArgs([])).toEqual({ open: true });
  });

  it("parses --port=<n>", () => {
    expect(parseArgs(["--port=3000"])).toEqual({ port: 3000, open: true });
  });

  it("parses --host=<h>", () => {
    expect(parseArgs(["--host=0.0.0.0"])).toEqual({ host: "0.0.0.0", open: true });
  });

  it("parses --no-open", () => {
    expect(parseArgs(["--no-open"])).toEqual({ open: false });
  });

  it("parses all three together, in any order", () => {
    expect(parseArgs(["--no-open", "--host=0.0.0.0", "--port=0"])).toEqual({
      port: 0,
      host: "0.0.0.0",
      open: false,
    });
  });

  it("rejects a non-numeric port with a clear error, not a silent NaN", () => {
    expect(() => parseArgs(["--port=abc"])).toThrow(/--port/);
  });

  it("rejects a port out of range", () => {
    expect(() => parseArgs(["--port=70000"])).toThrow(/--port/);
    expect(() => parseArgs(["--port=-1"])).toThrow(/--port/);
  });
});
