import { defineConfig } from "vitest/config";

// See packages/shared/vitest.config.ts for why this lives per-package
// rather than as a root-level exclude.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
  },
});
