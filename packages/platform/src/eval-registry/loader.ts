import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { ConfigError, EvalCaseSchema, NotFoundError, type EvalCase } from "@ao/shared";
import { parse as parseYaml } from "yaml";

const EVAL_CASE_FILE_EXTENSION = ".yaml";

/**
 * Lists every registered golden-task id under `<evalsDir>/cases/` — one
 * `<id>.yaml` file per case. Same directory-scan-and-nothing-else shape as
 * `@ao/platform`'s `listAgentTypes`/`listRecipeNames` (P10-T1/T4): adding a
 * golden task is adding a file, zero code changes.
 */
export function listEvalCaseIds(evalsDir: string): string[] {
  const casesDir = join(evalsDir, "cases");
  if (!existsSync(casesDir)) {
    throw new NotFoundError(`eval cases directory not found: ${casesDir}`);
  }
  return readdirSync(casesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(EVAL_CASE_FILE_EXTENSION))
    .map((entry) => basename(entry.name, EVAL_CASE_FILE_EXTENSION))
    .sort();
}

/**
 * Reads and validates `<evalsDir>/cases/<id>.yaml` fresh from disk on every
 * call — same no-cache, hot-by-construction design as `loadRecipe`/
 * `loadAgentDefinition`: editing a fixture takes effect on the very next run.
 */
export function loadEvalCase(evalsDir: string, id: string): EvalCase {
  const casePath = join(evalsDir, "cases", `${id}${EVAL_CASE_FILE_EXTENSION}`);
  if (!existsSync(casePath)) {
    throw new NotFoundError(`unknown eval case "${id}" — no file at ${casePath}`);
  }
  let raw: string;
  try {
    raw = readFileSync(casePath, "utf8");
  } catch (cause) {
    throw new ConfigError(`could not read ${casePath}`, { cause });
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (cause) {
    throw new ConfigError(`${casePath} is not valid YAML`, { cause });
  }
  const result = EvalCaseSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`${casePath} does not match EvalCaseSchema: ${result.error.message}`);
  }
  if (result.data.id !== id) {
    throw new ConfigError(
      `${casePath}'s "id" field ("${result.data.id}") does not match its filename ("${id}")`,
    );
  }
  return result.data;
}
