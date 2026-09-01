import { PlanSchema, type Message } from "@ao/shared";
import { describe, expect, it, vi } from "vitest";
import { ConcurrencyLimiter } from "../resilience/concurrency-limiter.js";
import type {
  GeminiCachedContent,
  GeminiCountTokensParams,
  GeminiCreateCachedContentParams,
  GeminiGenerateContentParams,
  GeminiGenerateContentResponse,
  GeminiModel,
  GeminiSdkClient,
} from "./client.js";
import { GeminiProvider } from "./gemini-provider.js";

const USER_MESSAGE: Message[] = [{ role: "user", parts: [{ text: "why is the sky blue?" }] }];

/**
 * The real SDK's streaming methods are `Promise<AsyncGenerator<T>>` — an
 * outer promise wrapping an inner async generator (verified against
 * `@google/genai`'s `.d.ts`) — so every mock here returns an async
 * generator from inside an `async` *function*, never directly as an
 * `async function*` mock (which would make TS, and the real SDK's actual
 * behavior, disagree about when a rejection can happen: a lazily-executed
 * generator body only runs — and could only throw — once something starts
 * iterating it, not at call time).
 */
function toStream<T>(items: T[]): AsyncGenerator<T> {
  // eslint-disable-next-line @typescript-eslint/require-await -- must be async to produce a real AsyncGenerator, matching the SDK's actual return shape; it never needs to await anything itself.
  return (async function* () {
    for (const item of items) yield item;
  })();
}

interface FakeClientOverrides {
  models?: Partial<GeminiSdkClient["models"]>;
  caches?: Partial<GeminiSdkClient["caches"]>;
}

function fakeClient(overrides: FakeClientOverrides = {}): GeminiSdkClient {
  return {
    models: {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(() => Promise.resolve(toStream<GeminiGenerateContentResponse>([{}]))),
      countTokens: vi.fn(() => Promise.resolve({ totalTokens: 42 })),
      list: vi.fn(() => Promise.resolve(toStream<GeminiModel>([]))),
      ...overrides.models,
    },
    caches: {
      create: vi.fn(() => Promise.resolve({ name: "cachedContents/abc" })),
      ...overrides.caches,
    },
  };
}

async function collectDeltas(gen: AsyncIterable<{ text: string }>): Promise<string> {
  let out = "";
  for await (const delta of gen) out += delta.text;
  return out;
}

describe("GeminiProvider.countTokens", () => {
  it("returns totalTokens from the SDK's CountTokensResponse", async () => {
    const client = fakeClient();
    const provider = new GeminiProvider({ apiKey: "test-key", client });
    const count = await provider.countTokens({ model: "gemini-3.7-flash", contents: USER_MESSAGE });
    expect(count).toBe(42);
    const expectedPartial: Partial<GeminiCountTokensParams> = { model: "gemini-3.7-flash" };
    expect(client.models.countTokens).toHaveBeenCalledWith(expect.objectContaining(expectedPartial));
  });
});

describe("GeminiProvider.generate — streaming and usage", () => {
  it("yields one delta per streamed chunk and captures usageMetadata in full on the terminal delta", async () => {
    const chunks: GeminiGenerateContentResponse[] = [
      { candidates: [{ content: { parts: [{ text: "The sky " }] } }] },
      {
        candidates: [{ content: { parts: [{ text: "is blue." }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          cachedContentTokenCount: 2,
          thoughtsTokenCount: 1,
        },
      },
    ];
    const client = fakeClient({
      models: { generateContentStream: vi.fn(() => Promise.resolve(toStream(chunks))) },
    });
    const provider = new GeminiProvider({ apiKey: "test-key", client });

    const deltas = [];
    for await (const d of provider.generate({ model: "gemini-3.7-flash", contents: USER_MESSAGE })) {
      deltas.push(d);
    }

    expect(deltas.map((d) => d.text).join("")).toBe("The sky is blue.");
    expect(deltas[0]?.finishReason).toBeUndefined();
    expect(deltas[1]?.finishReason).toBe("stop");
    expect(deltas[1]?.usage).toEqual({
      promptTokens: 10,
      candidatesTokens: 5,
      thoughtsTokens: 1,
      cachedTokens: 2,
    });
  });

  it("maps MAX_TOKENS finishReason correctly", async () => {
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn(() =>
          Promise.resolve(
            toStream([
              { candidates: [{ content: { parts: [{ text: "cut off" }] }, finishReason: "MAX_TOKENS" }] },
            ]),
          ),
        ),
      },
    });
    const provider = new GeminiProvider({ apiKey: "k", client });
    const deltas = [];
    for await (const d of provider.generate({ model: "gemini-3.7-flash", contents: USER_MESSAGE }))
      deltas.push(d);
    expect(deltas[0]?.finishReason).toBe("max_tokens");
  });

  it("maps thinking-only chunks to isThought:true", async () => {
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn(() =>
          Promise.resolve(
            toStream([{ candidates: [{ content: { parts: [{ text: "pondering...", thought: true }] } }] }]),
          ),
        ),
      },
    });
    const provider = new GeminiProvider({ apiKey: "k", client });
    const deltas = [];
    for await (const d of provider.generate({ model: "gemini-3.7-flash", contents: USER_MESSAGE }))
      deltas.push(d);
    expect(deltas[0]?.isThought).toBe(true);
  });

  it("passes thinkingLevel through as the uppercase Gemini enum string", async () => {
    let captured: GeminiGenerateContentParams | undefined;
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn((params: GeminiGenerateContentParams) => {
          captured = params;
          return Promise.resolve(toStream<GeminiGenerateContentResponse>([{}]));
        }),
      },
    });
    const provider = new GeminiProvider({ apiKey: "k", client });
    await collectDeltas(
      provider.generate({ model: "gemini-3.7-flash", contents: USER_MESSAGE, thinkingLevel: "low" }),
    );
    expect(captured?.config?.thinkingConfig?.thinkingLevel).toBe("LOW");
  });

  it("narrows a Zod responseSchema to Gemini's dialect and sets responseMimeType", async () => {
    let captured: GeminiGenerateContentParams | undefined;
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn((params: GeminiGenerateContentParams) => {
          captured = params;
          return Promise.resolve(toStream<GeminiGenerateContentResponse>([{}]));
        }),
      },
    });
    const provider = new GeminiProvider({ apiKey: "k", client });
    await collectDeltas(
      provider.generate({ model: "gemini-3.7-flash", contents: USER_MESSAGE, responseSchema: PlanSchema }),
    );
    expect(captured?.config?.responseMimeType).toBe("application/json");
    const schema = captured?.config?.responseSchema as { type?: string } | undefined;
    expect(schema?.type).toBe("OBJECT");
  });
});

describe("GeminiProvider — response cache (P1-T6)", () => {
  it("an identical second generate() call never touches generateContentStream again", async () => {
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn(() =>
          Promise.resolve(
            toStream([
              { candidates: [{ content: { parts: [{ text: "cached answer" }] }, finishReason: "STOP" }] },
            ]),
          ),
        ),
      },
    });
    const provider = new GeminiProvider({ apiKey: "k", client });
    const req = { model: "gemini-3.7-flash", contents: USER_MESSAGE };

    expect(await collectDeltas(provider.generate(req))).toBe("cached answer");
    expect(await collectDeltas(provider.generate(req))).toBe("cached answer");
    expect(client.models.generateContentStream).toHaveBeenCalledTimes(1);
  });
});

describe("GeminiProvider — resilience (P1-T5)", () => {
  it("retries a 429 and eventually succeeds, honoring the retry classification", async () => {
    // An immediate rate-limit rejection happens at the outer promise,
    // before any streaming starts — not mid-iteration.
    let attempts = 0;
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn((): Promise<AsyncIterable<GeminiGenerateContentResponse>> => {
          attempts += 1;
          if (attempts < 3) {
            return Promise.reject(Object.assign(new Error("rate limited"), { status: 429 }));
          }
          return Promise.resolve(
            toStream([{ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }]),
          );
        }),
      },
    });
    const provider = new GeminiProvider({
      apiKey: "k",
      client,
      retry: { sleep: () => Promise.resolve(), baseDelayMs: 1 },
    });
    const text = await collectDeltas(
      provider.generate({ model: "gemini-3.7-flash", contents: USER_MESSAGE }),
    );
    expect(text).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("wraps an exhausted 429 into ProviderRateLimitError with code PROVIDER_RATE_LIMITED", async () => {
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn(() =>
          Promise.reject(Object.assign(new Error("still limited"), { status: 429 })),
        ),
      },
    });
    const provider = new GeminiProvider({
      apiKey: "k",
      client,
      retry: { sleep: () => Promise.resolve(), maxAttempts: 2, baseDelayMs: 1 },
    });
    await expect(
      collectDeltas(provider.generate({ model: "gemini-3.7-flash", contents: USER_MESSAGE })),
    ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
  });

  it("never exceeds the configured global concurrency limit across concurrent calls", async () => {
    let active = 0;
    let observedMax = 0;
    const client = fakeClient({
      models: {
        countTokens: vi.fn(async () => {
          active += 1;
          observedMax = Math.max(observedMax, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
          return { totalTokens: 1 };
        }),
      },
    });
    const provider = new GeminiProvider({
      apiKey: "k",
      client,
      concurrencyLimiter: new ConcurrencyLimiter(2),
    });
    await Promise.all(
      Array.from({ length: 6 }, () =>
        provider.countTokens({ model: "gemini-3.7-flash", contents: USER_MESSAGE }),
      ),
    );
    expect(observedMax).toBeLessThanOrEqual(2);
  });
});

describe("GeminiProvider.cacheCreate", () => {
  it("returns a CacheRef built from the SDK's CachedContent", async () => {
    const created: GeminiCachedContent = {
      name: "cachedContents/xyz",
      model: "gemini-3.7-flash",
      expireTime: "2026-09-01T12:00:00Z",
      usageMetadata: { totalTokenCount: 5000 },
    };
    const client = fakeClient({ caches: { create: vi.fn(() => Promise.resolve(created)) } });
    const provider = new GeminiProvider({ apiKey: "k", client });
    const ref = await provider.cacheCreate({
      model: "gemini-3.7-flash",
      contents: USER_MESSAGE,
      ttlSeconds: 600,
    });
    expect(ref).toEqual({
      name: "cachedContents/xyz",
      model: "gemini-3.7-flash",
      expiresAt: "2026-09-01T12:00:00Z",
      cachedTokenCount: 5000,
    });
  });

  it("throws a ProviderError when the SDK returns no resource name", async () => {
    const client = fakeClient({ caches: { create: vi.fn(() => Promise.resolve<GeminiCachedContent>({})) } });
    const provider = new GeminiProvider({ apiKey: "k", client });
    await expect(
      provider.cacheCreate({ model: "gemini-3.7-flash", contents: USER_MESSAGE, ttlSeconds: 600 }),
    ).rejects.toMatchObject({ code: "PROVIDER_REQUEST_FAILED" });
  });

  it("sends the ttl as a Gemini duration string", async () => {
    let captured: GeminiCreateCachedContentParams | undefined;
    const client = fakeClient({
      caches: {
        create: vi.fn((params: GeminiCreateCachedContentParams) => {
          captured = params;
          return Promise.resolve({ name: "cachedContents/abc" });
        }),
      },
    });
    const provider = new GeminiProvider({ apiKey: "k", client });
    await provider.cacheCreate({ model: "gemini-3.7-flash", contents: USER_MESSAGE, ttlSeconds: 600 });
    expect(captured?.config?.ttl).toBe("600s");
  });
});

describe("GeminiProvider.models", () => {
  it("normalizes the live catalog, stripping the models/ prefix and deriving capability flags", async () => {
    const models: GeminiModel[] = [
      {
        name: "models/gemini-3.7-flash",
        displayName: "Gemini 3.7 Flash",
        inputTokenLimit: 1_000_000,
        outputTokenLimit: 64_000,
        supportedActions: ["generateContent", "countTokens", "createCachedContent"],
        thinking: true,
      },
    ];
    const client = fakeClient({ models: { list: vi.fn(() => Promise.resolve(toStream(models))) } });
    const provider = new GeminiProvider({ apiKey: "k", client });
    const result = await provider.models();
    expect(result).toEqual([
      {
        id: "gemini-3.7-flash",
        displayName: "Gemini 3.7 Flash",
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 64_000,
        supportsGenerate: true,
        supportsCountTokens: true,
        supportsCaching: true,
        supportsThinking: true,
      },
    ]);
  });
});

describe("GeminiProvider — egress redaction (P1-T9)", () => {
  it("redacts a secret-shaped systemInstruction before it reaches the SDK call, and records the redaction", async () => {
    let captured: GeminiGenerateContentParams | undefined;
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn((params: GeminiGenerateContentParams) => {
          captured = params;
          return Promise.resolve(toStream<GeminiGenerateContentResponse>([{}]));
        }),
      },
    });
    const provider = new GeminiProvider({ apiKey: "k", client });
    const leaked = "AIzaSyD-9tbanRKq0S8dr8dJHqOI4nfKfrKzKI8";

    await collectDeltas(
      provider.generate({
        model: "gemini-3.7-flash",
        contents: USER_MESSAGE,
        systemInstruction: `key: ${leaked}`,
      }),
    );

    expect(captured?.config?.systemInstruction).not.toContain(leaked);
    expect(captured?.config?.systemInstruction).toContain("[REDACTED]");
    expect(provider.getEgressRedactions().length).toBeGreaterThan(0);
  });

  it("registers the loaded API key itself, catching it if it ever leaks into free text", async () => {
    let captured: GeminiGenerateContentParams | undefined;
    const apiKey = "sk-my-actual-provider-key-loaded-at-startup";
    const client = fakeClient({
      models: {
        generateContentStream: vi.fn((params: GeminiGenerateContentParams) => {
          captured = params;
          return Promise.resolve(toStream<GeminiGenerateContentResponse>([{}]));
        }),
      },
    });
    const provider = new GeminiProvider({ apiKey, client });

    await collectDeltas(
      provider.generate({
        model: "gemini-3.7-flash",
        contents: USER_MESSAGE,
        systemInstruction: `debug: using ${apiKey}`,
      }),
    );

    expect(captured?.config?.systemInstruction).not.toContain(apiKey);
  });
});
