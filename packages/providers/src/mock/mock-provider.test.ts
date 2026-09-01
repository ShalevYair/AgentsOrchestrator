import type { GenerateRequest } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "./mock-provider.js";

function req(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return { model: "gemini-3.7-flash", contents: [{ role: "user", parts: [{ text: "hi" }] }], ...overrides };
}

describe("MockLLMProvider", () => {
  it("implements all four LLMProvider methods and records every call", async () => {
    const provider = new MockLLMProvider({ responses: [{ text: "hello world" }] });

    const tokenCount = await provider.countTokens({ model: "gemini-3.7-flash", contents: req().contents });
    expect(tokenCount).toBeGreaterThan(0);

    const deltas = [];
    for await (const delta of provider.generate(req())) deltas.push(delta);
    expect(deltas.at(-1)?.finishReason).toBe("stop");
    expect(deltas.map((d) => d.text).join("")).toBe("hello world");

    const cacheRef = await provider.cacheCreate({
      model: "gemini-3.7-flash",
      contents: [{ role: "user", parts: [{ text: "shared prefix" }] }],
      ttlSeconds: 600,
    });
    expect(cacheRef.name).toMatch(/^mock-cache-/);

    const models = await provider.models();
    expect(models.length).toBeGreaterThan(0);

    expect(provider.calls.countTokens).toHaveLength(1);
    expect(provider.calls.generate).toHaveLength(1);
    expect(provider.calls.cacheCreate).toHaveLength(1);
    expect(provider.calls.modelsCallCount).toBe(1);
  });

  it("splits a response into multiple streamed deltas when chunkCount is set", async () => {
    const provider = new MockLLMProvider({ responses: [{ text: "abcdef", chunkCount: 3 }] });
    const deltas = [];
    for await (const delta of provider.generate(req())) deltas.push(delta);
    expect(deltas).toHaveLength(3);
    expect(deltas.map((d) => d.text).join("")).toBe("abcdef");
    // Only the terminal delta carries finishReason/usage.
    expect(deltas[0]?.finishReason).toBeUndefined();
    expect(deltas[1]?.finishReason).toBeUndefined();
    expect(deltas[2]?.finishReason).toBe("stop");
    expect(deltas[2]?.usage).toBeDefined();
  });

  it("consumes an array of canned responses in order, repeating the last one once exhausted", async () => {
    const provider = new MockLLMProvider({ responses: [{ text: "first" }, { text: "second" }] });
    async function textOf(): Promise<string> {
      let out = "";
      for await (const d of provider.generate(req())) out += d.text;
      return out;
    }
    expect(await textOf()).toBe("first");
    expect(await textOf()).toBe("second");
    expect(await textOf()).toBe("second");
  });

  it("supports a response function that reacts to the request", async () => {
    const provider = new MockLLMProvider({
      responses: (r) => ({ text: `echo:${r.contents[0]?.parts[0]?.text ?? ""}` }),
    });
    let out = "";
    for await (const d of provider.generate(
      req({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }),
    )) {
      out += d.text;
    }
    expect(out).toBe("echo:ping");
  });

  it("defaults to a plain canned response when none is configured", async () => {
    const provider = new MockLLMProvider();
    let out = "";
    for await (const d of provider.generate(req())) out += d.text;
    expect(out).toBe("mock response");
  });
});
