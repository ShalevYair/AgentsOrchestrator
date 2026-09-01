import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.tsc-out/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.data/**",
      "pnpm-lock.yaml",
    ],
  },
  {
    files: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts", "apps/*/src/**/*.tsx"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // P2-T2 / ADR-012: `node:sqlite` is experimental and wrapped behind a
    // narrow interface so a future swap (libsql/sql.js) touches one file.
    // This block bans importing it anywhere under apps/runtime/src...
    files: ["apps/runtime/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:sqlite",
              message:
                "Only apps/runtime/src/db/driver.ts may import node:sqlite directly — go through SqlDriver.",
            },
          ],
        },
      ],
    },
  },
  {
    // ...and this later, more specific block re-enables it for driver.ts
    // itself — flat config applies matching blocks in order, so the later,
    // narrower match wins for that one file.
    files: ["apps/runtime/src/db/driver.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["*.config.{js,mjs,ts}", "*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "module",
    },
  },
  eslintConfigPrettier,
);
