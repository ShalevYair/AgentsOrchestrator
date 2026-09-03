import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api.js";

function mockFetchOnce(response: Partial<Response> & { ok: boolean; status: number }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
      ...response,
    }),
  );
}

describe("lib/api.ts request() headers (P9-T11 regression)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Real bug, found via P9-T11's real-browser Playwright verification (not
   * discoverable through server.test.ts's Fastify `.inject()`, which
   * doesn't reproduce this real-HTTP content-type check): sending
   * `content-type: application/json` on a request with *no body* makes
   * the real runtime reject it with `FST_ERR_CTP_EMPTY_JSON_BODY` (400) —
   * confirmed directly against the real server via curl. `deleteKey` had
   * silently been broken by this since P2-T7 (its own `.catch()` treats
   * failure as best-effort and says nothing), never caught because no
   * test exercised a real HTTP request without a body until now.
   */
  it("a bodyless call (stopRun) sends no content-type header", async () => {
    mockFetchOnce({ ok: true, status: 204 });
    await api.stopRun("run_abc123");

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.headers).toBeUndefined();
  });

  it("a bodyless call (deleteKey) sends no content-type header", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ hasKey: false, backend: null, maskedKey: null }),
    });
    await api.deleteKey();

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.headers).toBeUndefined();
  });

  it("a call with a real JSON body still sends content-type: application/json", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ runId: "run_1", userMessage: {} }),
    });
    await api.postMessage("thread_1", "hello");

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init?.headers).toMatchObject({ "content-type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ content: "hello" }));
  });

  it("a 204 response resolves to undefined, not an empty-body parse error", async () => {
    mockFetchOnce({ ok: true, status: 204 });
    await expect(api.stopRun("run_abc123")).resolves.toBeUndefined();
  });

  it("a non-ok response still throws a real ApiError, unaffected by the header change", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          scope: "validation",
          code: "SCHEMA_VALIDATION_FAILED",
          message: "bad",
          recoverable: true,
        }),
    });
    await expect(api.deleteKey()).rejects.toBeInstanceOf(ApiError);
  });
});
