import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk.js";

function makeParagraphs(count: number, sentencesPerParagraph = 3): string {
  const paragraphs: string[] = [];
  for (let p = 0; p < count; p++) {
    const sentences = Array.from(
      { length: sentencesPerParagraph },
      (_, s) => `Paragraph ${String(p)} sentence ${String(s)} with some filler words to pad length.`,
    );
    paragraphs.push(sentences.join(" "));
  }
  return paragraphs.join("\n\n");
}

describe("chunkText", () => {
  it("returns [] for empty text", () => {
    expect(chunkText("a1", "")).toEqual([]);
  });

  it("returns a single chunk for text under maxChars", () => {
    const text = "hello world\nsecond line\n";
    const chunks = chunkText("a1", text, { maxChars: 4000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(text);
    expect(chunks[0]?.loc).toEqual({
      startLine: 1,
      endLine: 2,
      startOffset: 0,
      endOffset: text.length,
    });
  });

  it("every chunk carries artifactId and a precise loc", () => {
    const text = makeParagraphs(40);
    const chunks = chunkText("artifact-42", text, { maxChars: 300, overlapChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.artifactId).toBe("artifact-42");
      expect(chunk.id).toBe(`artifact-42#${String(chunk.index)}`);
      expect(chunk.loc.startOffset).toBeLessThan(chunk.loc.endOffset);
      expect(chunk.loc.startLine).toBeLessThanOrEqual(chunk.loc.endLine);
      // The chunk's declared core text must actually appear in `text` (it's a substring of it).
      expect(chunk.text).toContain(text.slice(chunk.loc.startOffset, chunk.loc.endOffset));
    }
  });

  it("round-trips: concatenating each chunk's core span reconstructs the original text exactly", () => {
    const text = makeParagraphs(60, 4);
    const chunks = chunkText("a1", text, { maxChars: 500, overlapChars: 80 });

    const reconstructed = chunks.map((c) => text.slice(c.loc.startOffset, c.loc.endOffset)).join("");
    expect(reconstructed).toBe(text);
  });

  it("round-trips for code-like content too", () => {
    const fns = Array.from(
      { length: 25 },
      (_, i) => `export function fn${String(i)}(x: number): number {\n  return x + ${String(i)};\n}`,
    );
    const text = fns.join("\n\n");
    const chunks = chunkText("code.ts", text, { maxChars: 200, overlapChars: 30 });
    const reconstructed = chunks.map((c) => text.slice(c.loc.startOffset, c.loc.endOffset)).join("");
    expect(reconstructed).toBe(text);
  });

  it("core spans are contiguous and non-overlapping", () => {
    const text = makeParagraphs(30);
    const chunks = chunkText("a1", text, { maxChars: 400, overlapChars: 50 });
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]?.loc.startOffset).toBe(chunks[i - 1]?.loc.endOffset);
    }
    expect(chunks[0]?.loc.startOffset).toBe(0);
    expect(chunks[chunks.length - 1]?.loc.endOffset).toBe(text.length);
  });

  it("prefers cutting at a blank-line paragraph boundary over a mid-paragraph cut", () => {
    // Two short paragraphs that together are just over maxChars — the cut
    // should land on the blank line between them, not mid-sentence.
    const p1 = "First paragraph with enough words to take up plenty of space here.";
    const p2 = "Second paragraph also has enough words to take up plenty of space.";
    const text = `${p1}\n\n${p2}`;
    const chunks = chunkText("a1", text, { maxChars: p1.length + 5, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.text.trimEnd()).toBe(p1);
  });

  it("makes progress even when a single line exceeds maxChars", () => {
    const longLine = "x".repeat(500);
    const text = `${longLine}\n${longLine}\n${longLine}`;
    const chunks = chunkText("a1", text, { maxChars: 100, overlapChars: 10 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const reconstructed = chunks.map((c) => text.slice(c.loc.startOffset, c.loc.endOffset)).join("");
    expect(reconstructed).toBe(text);
  });

  it("applies overlap: chunk N's text is longer than its own core span and contains the previous chunk's tail", () => {
    const text = makeParagraphs(30);
    const chunks = chunkText("a1", text, { maxChars: 300, overlapChars: 60 });
    expect(chunks.length).toBeGreaterThan(1);
    const prev = chunks[0];
    const next = chunks[1];
    if (!prev || !next) throw new Error("expected at least 2 chunks");

    const coreLen = next.loc.endOffset - next.loc.startOffset;
    expect(next.text.length).toBeGreaterThan(coreLen);

    const prevTailStart = Math.max(prev.loc.endOffset - 60, prev.loc.startOffset);
    const prevTail = text.slice(prevTailStart, prev.loc.endOffset);
    expect(next.text).toContain(prevTail);
  });
});
