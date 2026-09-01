import { isAppError } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "../mock/mock-provider.js";
import { validateApiKey } from "./validate-key.js";

describe("validateApiKey", () => {
  it("returns the live model list when the key is valid", async () => {
    const provider = new MockLLMProvider();
    const models = await validateApiKey(provider);
    expect(models.length).toBeGreaterThan(0);
  });

  it("wraps a rejected models() call (e.g. a real 401) into a ProviderKeyError, never a raw stack trace", async () => {
    const provider = new MockLLMProvider();
    provider.models = () => Promise.reject(new Error("401 Unauthorized: API key not valid"));

    await expect(validateApiKey(provider)).rejects.toMatchObject({ code: "PROVIDER_KEY_INVALID" });
    try {
      await validateApiKey(provider);
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.userMessage).not.toContain("401");
        expect(error.userMessage).not.toContain("Error:");
        expect(error.userMessage.length).toBeGreaterThan(0);
        expect(error.recoverable).toBe(false);
      }
    }
  });

  it("treats an empty model catalog as an invalid key too", async () => {
    const provider = new MockLLMProvider({ models: [] });
    await expect(validateApiKey(provider)).rejects.toMatchObject({ code: "PROVIDER_KEY_INVALID" });
  });
});
