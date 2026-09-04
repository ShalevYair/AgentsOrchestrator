import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { ConfigError, NotFoundError, RecipeSchema, type Recipe } from "@ao/shared";
import { parse as parseYaml } from "yaml";

const RECIPE_FILE_EXTENSION = ".yaml";

/**
 * Lists every registered recipe name under `recipesDir` — one `<name>.yaml`
 * file per recipe (TASKS.md P10-T4: "תבניות תוכנית ב-YAML"). Same shape as
 * `@ao/platform`'s agent-registry `listAgentTypes`: a directory scan and
 * nothing else, so adding a recipe is adding a file, zero code changes.
 */
export function listRecipeNames(recipesDir: string): string[] {
  if (!existsSync(recipesDir)) {
    throw new NotFoundError(`recipes directory not found: ${recipesDir}`);
  }
  return readdirSync(recipesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(RECIPE_FILE_EXTENSION))
    .map((entry) => basename(entry.name, RECIPE_FILE_EXTENSION))
    .sort();
}

/**
 * Reads and validates `<recipesDir>/<name>.yaml` fresh from disk on every
 * call — same no-cache, hot-by-construction design as `loadAgentDefinition`
 * (P10-T2): editing a recipe file takes effect on the very next load.
 */
export function loadRecipe(recipesDir: string, name: string): Recipe {
  const recipePath = join(recipesDir, `${name}${RECIPE_FILE_EXTENSION}`);
  if (!existsSync(recipePath)) {
    throw new NotFoundError(`unknown recipe "${name}" — no file at ${recipePath}`);
  }
  let raw: string;
  try {
    raw = readFileSync(recipePath, "utf8");
  } catch (cause) {
    throw new ConfigError(`could not read ${recipePath}`, { cause });
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (cause) {
    throw new ConfigError(`${recipePath} is not valid YAML`, { cause });
  }
  const result = RecipeSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`${recipePath} does not match RecipeSchema: ${result.error.message}`);
  }
  if (result.data.name !== name) {
    throw new ConfigError(
      `${recipePath}'s "name" field ("${result.data.name}") does not match its filename ("${name}")`,
    );
  }
  return result.data;
}
