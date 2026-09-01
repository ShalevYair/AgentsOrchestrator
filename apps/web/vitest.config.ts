import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// See packages/shared/vitest.config.ts for why this lives per-package
// rather than as a root-level exclude.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
