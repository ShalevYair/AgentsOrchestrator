import { describe, expect, it } from "vitest";
import { parseCsv, rowsToCsv } from "./csv.js";

describe("rowsToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("writes a header row from the first row's keys, then one line per row", () => {
    const csv = rowsToCsv([
      { name: "a", count: 1 },
      { name: "b", count: 2 },
    ]);
    expect(csv).toBe("name,count\na,1\nb,2");
  });

  it("quotes a field containing a comma", () => {
    expect(rowsToCsv([{ text: "hello, world" }])).toBe('text\n"hello, world"');
  });

  it("quotes a field containing a newline", () => {
    expect(rowsToCsv([{ text: "line1\nline2" }])).toBe('text\n"line1\nline2"');
  });

  it("doubles an embedded quote", () => {
    expect(rowsToCsv([{ text: 'say "hi"' }])).toBe('text\n"say ""hi"""');
  });

  it("renders null/undefined as an empty cell", () => {
    expect(rowsToCsv([{ a: null, b: undefined }])).toBe("a,b\n,");
  });
});

describe("parseCsv", () => {
  it("round-trips through rowsToCsv for plain values", () => {
    const rows = [
      { name: "a", count: "1" },
      { name: "b", count: "2" },
    ];
    expect(parseCsv(rowsToCsv(rows))).toEqual(rows);
  });

  it("round-trips a field containing a comma", () => {
    const rows = [{ text: "hello, world" }];
    expect(parseCsv(rowsToCsv(rows))).toEqual(rows);
  });

  it("round-trips a field containing an embedded quote", () => {
    const rows = [{ text: 'say "hi"' }];
    expect(parseCsv(rowsToCsv(rows))).toEqual(rows);
  });

  it("parses tab-delimited (TSV) text when asked", () => {
    expect(parseCsv("a\tb\n1\t2", "\t")).toEqual([{ a: "1", b: "2" }]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
