import { describe, expect, it, vi } from "vitest";
import { runDemo } from "./demo.js";

describe("runDemo", () => {
  it("exits cleanly (no network call, no throw) when GEMINI_API_KEY is absent — this environment's actual situation", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(runDemo(undefined)).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("GEMINI_API_KEY is not set"));
    logSpy.mockRestore();
  });
});
