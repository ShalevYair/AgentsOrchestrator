import { describe, expect, it } from "vitest";
import { createSecretRegistry } from "@ao/platform";
import { GeminiProvider, MockLLMProvider, WORKER_MODEL_ID } from "@ao/providers";
import { buildProviderFor, selectProvider } from "./select-provider.js";

const ENV_KEY = "AIzaEnvKeyEnvKeyEnvKeyEnvKeyEnvKeyE12";
const STORED_KEY = "AIzaStoredKeyStoredKeyStoredKeyStore1";

async function drainMockReply(provider: MockLLMProvider): Promise<string> {
  let text = "";
  for await (const delta of provider.generate({ model: "x", contents: [] })) {
    text += delta.text;
  }
  return text;
}

describe("selectProvider", () => {
  it("picks Gemini from a GEMINI_API_KEY env var", () => {
    const selected = selectProvider({ env: { GEMINI_API_KEY: ENV_KEY } });
    expect(selected.kind).toBe("gemini");
    expect(selected.model).toBe(WORKER_MODEL_ID);
    expect(selected.provider).toBeInstanceOf(GeminiProvider);
  });

  it("falls back to Mock when neither an env var nor a stored key is present", async () => {
    const selected = selectProvider({ env: {} });
    expect(selected.kind).toBe("mock");
    expect(selected.provider).toBeInstanceOf(MockLLMProvider);
    const text = await drainMockReply(selected.provider as MockLLMProvider);
    expect(text).toContain("mock reply");
    expect(text).toContain("GEMINI_API_KEY");
  });

  it("recognizes a key saved via Settings in an earlier session (storedApiKey) when no env var is set — P2-T7 bug fix", () => {
    const selected = selectProvider({ env: {}, storedApiKey: STORED_KEY });
    expect(selected.kind).toBe("gemini");
    expect(selected.model).toBe(WORKER_MODEL_ID);
    expect(selected.provider).toBeInstanceOf(GeminiProvider);
  });

  it("treats an empty-string env var as absent and still falls back to a stored key", () => {
    const selected = selectProvider({ env: { GEMINI_API_KEY: "" }, storedApiKey: STORED_KEY });
    expect(selected.kind).toBe("gemini");
  });

  it("prefers the env var over a stored key when both are present, and only registers the winning key as a secret", () => {
    const secretRegistry = createSecretRegistry();
    const selected = selectProvider({
      env: { GEMINI_API_KEY: ENV_KEY },
      storedApiKey: STORED_KEY,
      secretRegistry,
    });
    expect(selected.kind).toBe("gemini");
    expect(secretRegistry.redact(`key is ${ENV_KEY}`)).not.toContain(ENV_KEY);
    expect(secretRegistry.redact(`key is ${STORED_KEY}`)).toContain(STORED_KEY);
  });

  it("falls back to Mock when storedApiKey is null (nothing ever saved)", () => {
    const selected = selectProvider({ env: {}, storedApiKey: null });
    expect(selected.kind).toBe("mock");
  });
});

describe("buildProviderFor", () => {
  it.each([[undefined], [null], [""]])("returns Mock for %p", (apiKey) => {
    const selected = buildProviderFor(apiKey);
    expect(selected.kind).toBe("mock");
    expect(selected.provider).toBeInstanceOf(MockLLMProvider);
  });

  it("returns a real Gemini provider for a non-empty key — this is what routes/keys.ts hot-swaps to on save", () => {
    const selected = buildProviderFor(STORED_KEY);
    expect(selected.kind).toBe("gemini");
    expect(selected.model).toBe(WORKER_MODEL_ID);
    expect(selected.provider).toBeInstanceOf(GeminiProvider);
  });
});
