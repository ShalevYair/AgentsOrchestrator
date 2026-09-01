import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each project's own vitest.config.ts (not this root exclude, which does
    // not reliably apply inside directory-glob project entries) restricts
    // test discovery to src/**/*.test.ts, so compiled dist/*.test.js never runs.
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      exclude: ["**/dist/**", "**/*.test.ts", "**/*.config.*"],
    },
  },
});
