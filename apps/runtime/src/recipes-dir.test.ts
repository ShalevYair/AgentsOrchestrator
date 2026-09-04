import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveRecipesDir } from "./recipes-dir.js";

describe("resolveRecipesDir", () => {
  it("returns AO_RECIPES_DIR verbatim when set, without touching the filesystem", () => {
    const result = resolveRecipesDir({
      env: { AO_RECIPES_DIR: "/somewhere/custom/recipes" },
      moduleUrl: import.meta.url,
    });
    expect(result).toBe("/somewhere/custom/recipes");
  });

  it("finds the real repo-root recipes/ directory by walking up from this module's own location", () => {
    const result = resolveRecipesDir({ env: {}, moduleUrl: import.meta.url });
    expect(basename(result)).toBe("recipes");
    expect(dirname(result)).toBe(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
  });
});
