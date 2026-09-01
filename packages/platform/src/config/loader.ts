import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { ConfigError } from "@ao/shared";
import { ConfigSchema, type Config, type ConfigInput } from "./schema.js";

export interface LoadConfigOptions {
  /** Explicit config file path. Overrides everything else that would locate one. */
  filePath?: string;
  /** process.env-like source, injectable for tests. */
  env?: NodeJS.ProcessEnv;
  /** Overrides coming from the UI/settings screen — highest precedence. */
  uiOverrides?: Partial<ConfigInput>;
}

const ENV_PREFIX = "AO_";

function computeDefaults(): ConfigInput {
  return {
    logLevel: "info",
    locale: "he",
    dataDir: join(homedir(), ".agents-orchestrator"),
  };
}

function loadFromFile(filePath: string): Partial<ConfigInput> {
  if (!existsSync(filePath)) {
    return {};
  }
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (cause) {
    throw new ConfigError(`could not read config file at ${filePath}`, { cause });
  }
  const errors: ParseError[] = [];
  const parsed: unknown = parseJsonc(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new ConfigError(`config file at ${filePath} is not valid JSONC (error code ${errors[0]?.error})`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`config file at ${filePath} must contain a JSON object`);
  }
  return parsed;
}

/**
 * Reads only the keys the schema knows about, translated from
 * AO_LOG_LEVEL / AO_LOCALE / AO_DATA_DIR (SCREAMING_SNAKE) to the matching
 * camelCase config key.
 */
function loadFromEnv(env: NodeJS.ProcessEnv): Partial<Record<keyof ConfigInput, string>> {
  const map: Record<string, keyof ConfigInput> = {
    [`${ENV_PREFIX}LOG_LEVEL`]: "logLevel",
    [`${ENV_PREFIX}LOCALE`]: "locale",
    [`${ENV_PREFIX}DATA_DIR`]: "dataDir",
  };
  const out: Partial<Record<keyof ConfigInput, string>> = {};
  for (const [envKey, configKey] of Object.entries(map)) {
    const value = env[envKey];
    if (value !== undefined) {
      out[configKey] = value;
    }
  }
  return out;
}

function resolveFilePath(options: LoadConfigOptions, env: NodeJS.ProcessEnv, defaults: ConfigInput): string {
  if (options.filePath !== undefined) {
    return options.filePath;
  }
  const fromEnv = env[`${ENV_PREFIX}CONFIG_FILE`];
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  return join(defaults.dataDir, "config.json");
}

/**
 * Precedence, lowest to highest: built-in defaults -> config file -> environment
 * variables -> UI-provided overrides. Each layer is a plain partial object;
 * only the final merge is validated, so a mistake in one layer can still be
 * corrected by a later one instead of failing the whole load immediately.
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  const env = options.env ?? process.env;
  const defaults = computeDefaults();
  const filePath = resolveFilePath(options, env, defaults);
  const fromFile = loadFromFile(filePath);
  const fromEnv = loadFromEnv(env);
  // Deliberately untyped as anything more precise than a plain bag: file and
  // env layers carry unvalidated strings (e.g. logLevel could be "loud"),
  // and ConfigSchema.safeParse below is the one real trust boundary that
  // turns this into a validated Config or a precise error.
  const merged: Record<string, unknown> = {
    ...defaults,
    ...fromFile,
    ...fromEnv,
    ...options.uiOverrides,
  };

  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`invalid configuration: ${issues}`, {
      details: { issues: result.error.issues.map((i) => i.message) },
    });
  }
  return result.data;
}
