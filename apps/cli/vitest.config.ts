import { defineConfig } from "vitest/config";

// See packages/shared/vitest.config.ts for why this lives per-package
// rather than as a root-level exclude — without it, tsc's own compiled
// dist-tsc/*.test.js would also match and every test would run twice.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
