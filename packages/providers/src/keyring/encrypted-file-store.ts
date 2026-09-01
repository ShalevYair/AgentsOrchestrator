import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname, platform, userInfo } from "node:os";
import { join } from "node:path";
import { checkPathLength } from "@ao/platform";
import type { KeyStore } from "./key-store.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * P1-T3's fallback path: AES-256-GCM, key derived (via `scrypt`) from a
 * machine/user fingerprint plus a locally-stored salt, used whenever the OS
 * keychain isn't reachable (this sandbox's Linux environment has no Secret
 * Service running — confirmed empirically, `AccessDenied` from
 * `@napi-rs/keyring`, not assumed).
 *
 * Honest limitation: the salt lives next to the encrypted file, so this
 * does not defend against an attacker with full read access to `dataDir` —
 * "machine-derived" here means a copy of just the `.enc` file (without the
 * salt, or on a machine with a different hostname/username) won't decrypt,
 * not that the file is safe against local compromise of the whole
 * directory. That's the same trust boundary the OS keychain path also
 * ultimately rests on (anyone who can act as the logged-in user can read
 * their own keychain), so this isn't a regression relative to the primary
 * path — it's the best available without a real OS-level secret store.
 */
export class EncryptedFileKeyStore implements KeyStore {
  readonly backend = "encrypted-file" as const;
  private readonly dataDir: string;
  private readonly saltPath: string;
  private readonly dataPath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.saltPath = join(dataDir, "keyring.salt");
    this.dataPath = join(dataDir, "keyring.enc");
    const lengthCheck = checkPathLength(this.dataPath);
    if (!lengthCheck.ok) {
      throw new Error(
        `EncryptedFileKeyStore: resolved path is ${lengthCheck.length} characters, over the ` +
          `recommended ${lengthCheck.limit} — choose a shorter dataDir`,
      );
    }
  }

  private fingerprint(): string {
    return `${hostname()}|${userInfo().username}|${platform()}`;
  }

  private bestEffortRestrictPermissions(path: string): void {
    try {
      chmodSync(path, 0o600);
    } catch {
      // Windows (and any FS without POSIX permission bits) has no chmod
      // equivalent here; the file still isn't world-readable by default
      // ACLs for a per-user profile directory, so this is best-effort only.
    }
  }

  private getOrCreateSalt(dataDir: string): Buffer {
    mkdirSync(dataDir, { recursive: true });
    if (existsSync(this.saltPath)) {
      return readFileSync(this.saltPath);
    }
    const salt = randomBytes(SALT_LENGTH);
    writeFileSync(this.saltPath, salt);
    this.bestEffortRestrictPermissions(this.saltPath);
    return salt;
  }

  private deriveKey(dataDir: string): Buffer {
    const salt = this.getOrCreateSalt(dataDir);
    return scryptSync(this.fingerprint(), salt, KEY_LENGTH);
  }

  set(secret: string): Promise<void> {
    const dataDir = this.dataDir;
    const key = this.deriveKey(dataDir);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, encrypted]);
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(this.dataPath, payload);
    this.bestEffortRestrictPermissions(this.dataPath);
    return Promise.resolve();
  }

  get(): Promise<string | null> {
    if (!existsSync(this.dataPath)) {
      return Promise.resolve(null);
    }
    const payload = readFileSync(this.dataPath);
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const key = this.deriveKey(this.dataDir);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return Promise.resolve(decrypted.toString("utf8"));
  }

  delete(): Promise<void> {
    if (existsSync(this.dataPath)) {
      unlinkSync(this.dataPath);
    }
    return Promise.resolve();
  }
}
