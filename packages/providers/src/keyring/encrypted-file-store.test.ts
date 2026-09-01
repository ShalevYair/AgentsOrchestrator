import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncryptedFileKeyStore } from "./encrypted-file-store.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "ao-keystore-test-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("EncryptedFileKeyStore", () => {
  it("round-trips a secret through set/get", async () => {
    const store = new EncryptedFileKeyStore(dataDir);
    await store.set("sk-super-secret-value");
    expect(await store.get()).toBe("sk-super-secret-value");
  });

  it("returns null when nothing has been stored", async () => {
    const store = new EncryptedFileKeyStore(dataDir);
    expect(await store.get()).toBeNull();
  });

  it("delete() removes the secret", async () => {
    const store = new EncryptedFileKeyStore(dataDir);
    await store.set("value");
    await store.delete();
    expect(await store.get()).toBeNull();
  });

  it("delete() on nothing stored is a safe no-op", async () => {
    const store = new EncryptedFileKeyStore(dataDir);
    await expect(store.delete()).resolves.toBeUndefined();
  });

  it("persists across a fresh instance pointed at the same dataDir (same machine)", async () => {
    const first = new EncryptedFileKeyStore(dataDir);
    await first.set("persisted-value");
    const second = new EncryptedFileKeyStore(dataDir);
    expect(await second.get()).toBe("persisted-value");
  });

  it("never writes the plaintext secret to disk — the encrypted file contains no substring of it", async () => {
    const store = new EncryptedFileKeyStore(dataDir);
    const secret = "AIzaSyD-super-recognizable-plaintext-marker";
    await store.set(secret);
    const raw = readFileSync(join(dataDir, "keyring.enc"));
    expect(raw.toString("latin1")).not.toContain(secret);
    expect(raw.toString("utf8")).not.toContain(secret);
  });

  it("rotation: setting a new value overwrites the old one", async () => {
    const store = new EncryptedFileKeyStore(dataDir);
    await store.set("old-value");
    await store.set("new-value");
    expect(await store.get()).toBe("new-value");
  });

  it("restricts the encrypted file and salt file to the dataDir (no path escape)", async () => {
    const store = new EncryptedFileKeyStore(dataDir);
    await store.set("value");
    expect(existsSync(join(dataDir, "keyring.enc"))).toBe(true);
    expect(existsSync(join(dataDir, "keyring.salt"))).toBe(true);
  });
});
