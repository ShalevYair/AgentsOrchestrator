import { defineConfig } from "vitest/config";

// See packages/shared/vitest.config.ts for why this lives per-package
// rather than as a root-level exclude.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // DB tests spin up real temp-file node:sqlite databases and WS tests
    // spin up a real HTTP server on a random port — both are cheap but not
    // safe to run with unlimited parallelism inside one worker pool.
    fileParallelism: false,
  },
});
