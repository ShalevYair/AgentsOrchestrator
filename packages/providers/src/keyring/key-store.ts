import { Entry } from "@napi-rs/keyring";
import { EncryptedFileKeyStore } from "./encrypted-file-store.js";

export type KeyStoreBackend = "os-keyring" | "encrypted-file";

/**
 * P1-T3. Never returns the raw `@napi-rs/keyring` errors to callers — `set`/`get`/`delete`
 * either succeed or reject with a normal `Error`; the *fallback decision* (OS keyring
 * unreachable -> encrypted file) happens inside `createKeyStore`, not here.
 */
export interface KeyStore {
  readonly backend: KeyStoreBackend;
  // Property (arrow-function) syntax, not method shorthand — see
  // GeminiSdkClient's identical note in gemini/client.ts.
  set: (secret: string) => Promise<void>;
  /** null when nothing has been stored (or it was deleted) — never throws for "not found". */
  get: () => Promise<string | null>;
  delete: () => Promise<void>;
}

const DEFAULT_SERVICE = "agents-orchestrator";
const DEFAULT_ACCOUNT = "gemini-api-key";

/**
 * Thin wrapper over `@napi-rs/keyring`'s synchronous `Entry` (ADR-012: chosen
 * over `keytar` specifically because it ships prebuilt binaries for
 * win32-x64/ia32/arm64-msvc, so no native compilation is ever required).
 * Windows -> Credential Manager, macOS -> Keychain, Linux -> Secret Service.
 * Every call can throw when the platform backend isn't reachable (confirmed
 * empirically in this sandbox: Linux with no Secret Service throws
 * `AccessDenied` on construction/first use) — that's expected and is what
 * `createKeyStore` catches to decide on the encrypted-file fallback.
 */
export class OsKeyringStore implements KeyStore {
  readonly backend = "os-keyring" as const;

  constructor(
    private readonly service: string = DEFAULT_SERVICE,
    private readonly account: string = DEFAULT_ACCOUNT,
  ) {}

  set(secret: string): Promise<void> {
    new Entry(this.service, this.account).setPassword(secret);
    return Promise.resolve();
  }

  get(): Promise<string | null> {
    return Promise.resolve(new Entry(this.service, this.account).getPassword());
  }

  delete(): Promise<void> {
    new Entry(this.service, this.account).deletePassword();
    return Promise.resolve();
  }
}

export interface CreateKeyStoreOptions {
  dataDir: string;
  service?: string;
  account?: string;
  /** Called once, the first time the OS keyring proves unreachable, so the caller can log/surface it. Never called again after that (this instance stays on the file backend for its lifetime). */
  onFallback?: (error: unknown) => void;
  /** Test seam: inject the primary store instead of a real `OsKeyringStore`. */
  primary?: KeyStore;
  /** Test seam: inject the fallback store instead of a real `EncryptedFileKeyStore`. */
  fallback?: KeyStore;
}

/**
 * A `KeyStore` that tries the OS keyring first and falls back to the
 * AES-GCM encrypted file the first time (and every time after) the keyring
 * throws — self-healing per call, not a one-time startup probe, so a
 * keyring that's merely locked at boot and unlocks later doesn't get
 * permanently written off. Once a fallback happens for a given store
 * instance, the choice is remembered as the "sticky" default so a `set`
 * that fell back doesn't leave a later `get` looking in the wrong place —
 * but it opportunistically retries the primary on the *next* explicit
 * `set` (a rotation), letting the app self-recover if the keyring comes
 * back.
 */
class FallbackKeyStore implements KeyStore {
  private usingFallback = false;

  constructor(
    private readonly primary: KeyStore,
    private readonly fallbackStore: KeyStore,
    private readonly onFallback?: (error: unknown) => void,
  ) {}

  get backend(): KeyStoreBackend {
    return this.usingFallback ? this.fallbackStore.backend : this.primary.backend;
  }

  async set(secret: string): Promise<void> {
    try {
      await this.primary.set(secret);
      this.usingFallback = false;
      return;
    } catch (error) {
      if (!this.usingFallback) this.onFallback?.(error);
      this.usingFallback = true;
    }
    await this.fallbackStore.set(secret);
  }

  async get(): Promise<string | null> {
    if (!this.usingFallback) {
      try {
        return await this.primary.get();
      } catch (error) {
        if (!this.usingFallback) this.onFallback?.(error);
        this.usingFallback = true;
      }
    }
    return this.fallbackStore.get();
  }

  async delete(): Promise<void> {
    if (!this.usingFallback) {
      try {
        await this.primary.delete();
        return;
      } catch (error) {
        if (!this.usingFallback) this.onFallback?.(error);
        this.usingFallback = true;
      }
    }
    await this.fallbackStore.delete();
  }
}

export function createKeyStore(options: CreateKeyStoreOptions): KeyStore {
  const primary = options.primary ?? new OsKeyringStore(options.service, options.account);
  const fallback = options.fallback ?? new EncryptedFileKeyStore(options.dataDir);
  return new FallbackKeyStore(primary, fallback, options.onFallback);
}
