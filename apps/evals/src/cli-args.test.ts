import { describe, expect, it } from "vitest";
import { parseTagFilters } from "./cli-args.js";

describe("parseTagFilters", () => {
  it("returns an empty list when no --tag= args are present", () => {
    expect(parseTagFilters(["--verbose", "foo"])).toEqual([]);
  });

  it("extracts a single --tag= value", () => {
    expect(parseTagFilters(["--tag=small"])).toEqual(["small"]);
  });

  it("extracts multiple repeated --tag= values, in order", () => {
    expect(parseTagFilters(["--tag=small", "--other", "--tag=he"])).toEqual(["small", "he"]);
  });

  it("ignores an empty --tag= value", () => {
    expect(parseTagFilters(["--tag=", "--tag=he"])).toEqual(["he"]);
  });
});
