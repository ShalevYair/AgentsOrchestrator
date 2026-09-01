import { defineConfig } from "vitest/config";

// A project-local include, not a root-level exclude: root `test.exclude`
// does not reliably apply inside `projects: [...]` entries that are plain
// directory globs (confirmed — it silently had zero effect on every
// platform, not just Windows, letting compiled dist/*.test.js run
// alongside the real src/*.test.ts). Restricting to the .ts sources here
// is unambiguous regardless of that inheritance question.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
