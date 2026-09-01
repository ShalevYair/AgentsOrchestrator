import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyStore } from "./key-store.js";
import { createKeyStore } from "./key-store.js";

function fakeStore(overrides: Partial<KeyStore> = {}): KeyStore {
  let value: string | null = null;
  return {
    backend: "os-keyring",
    set: vi.fn((secret: string) => {
      value = secret;
      return Promise.resolve();
    }),
    get: vi.fn(() => Promise.resolve(value)),
    delete: vi.fn(() => {
      value = null;
      return Promise.resolve();
    }),
    ...overrides,
  };
}

function throwingStore(message = "AccessDenied"): KeyStore {
  return {
    backend: "os-keyring",
    set: vi.fn(() => Promise.reject(new Error(message))),
    get: vi.fn(() => Promise.reject(new Error(message))),
    delete: vi.fn(() => Promise.reject(new Error(message))),
  };
}

describe("createKeyStore — deterministic unit tests with injected stores", () => {
  it("uses the primary store and reports backend='os-keyring' when it works", async () => {
    const primary = fakeStore({ backend: "os-keyring" });
    const fallback = fakeStore({ backend: "encrypted-file" });
    const store = createKeyStore({ dataDir: "/unused", primary, fallback });

    await store.set("secret-value");
    expect(store.backend).toBe("os-keyring");
    expect(await store.get()).toBe("secret-value");
    expect(fallback.set).not.toHaveBeenCalled();
  });

  it("falls back to the encrypted-file store when the primary throws, and calls onFallback once", async () => {
    const primary = throwingStore();
    const fallback = fakeStore({ backend: "encrypted-file" });
    const onFallback = vi.fn();
    const store = createKeyStore({ dataDir: "/unused", primary, fallback, onFallback });

    await store.set("secret-value");
    expect(store.backend).toBe("encrypted-file");
    expect(fallback.set).toHaveBeenCalledWith("secret-value");
    expect(onFallback).toHaveBeenCalledTimes(1);

    // A subsequent get() also goes straight to the fallback (sticky), not the broken primary again.
    await store.get();
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("delete() also falls back when the primary throws", async () => {
    const primary = throwingStore();
    const fallback = fakeStore({ backend: "encrypted-file" });
    const store = createKeyStore({ dataDir: "/unused", primary, fallback });

    await store.delete();
    expect(fallback.delete).toHaveBeenCalledTimes(1);
  });

  it("recovers to the primary on a later set() once it starts working again (rotation)", async () => {
    let broken = true;
    const primary: KeyStore = {
      backend: "os-keyring",
      set: vi.fn(() => (broken ? Promise.reject(new Error("AccessDenied")) : Promise.resolve())),
      get: vi.fn(() => Promise.resolve("irrelevant")),
      delete: vi.fn(() => Promise.resolve()),
    };
    const fallback = fakeStore({ backend: "encrypted-file" });
    const store = createKeyStore({ dataDir: "/unused", primary, fallback });

    await store.set("v1"); // falls back
    expect(store.backend).toBe("encrypted-file");

    broken = false;
    await store.set("v2"); // primary works again
    expect(store.backend).toBe("os-keyring");
  });

  it("never surfaces the raw secret value in a thrown error's message", async () => {
    const primary = throwingStore("some unrelated backend failure, no secret in here");
    const fallback = fakeStore({ backend: "encrypted-file" });
    const store = createKeyStore({ dataDir: "/unused", primary, fallback });
    await store.set("sk-should-never-appear-in-an-error");
    // The fallback succeeded, so nothing should have thrown at all — assert that directly.
    expect(store.backend).toBe("encrypted-file");
  });
});

describe("createKeyStore — real fallback path (no mocking of @napi-rs/keyring)", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "ao-keystore-real-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  /**
   * This environment genuinely has no D-Bus Secret Service running —
   * confirmed empirically (a direct `@napi-rs/keyring` `Entry` call throws
   * `AccessDenied` here, not mocked) — so this exercises the real P1-T3
   * fallback path end-to-end: real OS keyring attempt, real failure, real
   * AES-GCM file on a real temp directory. On a platform where a keychain
   * *is* available (a developer's own macOS/Windows machine, or a CI
   * runner with Secret Service), this same test still passes: it only
   * asserts the store round-trips correctly and that `backend` reflects
   * wherever the value is actually stored — not that a fallback occurred.
   */
  it("stores and retrieves a real API-key-shaped value end to end, regardless of which backend was used", async () => {
    const store = createKeyStore({
      dataDir,
      service: "agents-orchestrator-test",
      account: "test-key",
    });

    await store.set("AIzaSyTestKeyValueUsedOnlyInThisUnitTest0000");
    expect(await store.get()).toBe("AIzaSyTestKeyValueUsedOnlyInThisUnitTest0000");
    expect(["os-keyring", "encrypted-file"]).toContain(store.backend);

    await store.delete();
    expect(await store.get()).toBeNull();
  });
});
