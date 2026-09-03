/**
 * Browser-safe cut of `./checkpoint` — this is what `@ao/core/checkpoint`
 * (the package.json subpath, consumed by `apps/web/src/lib/run-state.ts`)
 * actually resolves to. `checkpoint/index.ts` is the *full* barrel used
 * server-side (via `@ao/core`'s main entry): it also exports `agent.ts`,
 * `gate.ts`, and `replan.ts`, which pull in `continuation/` → `parse/
 * ndjson.ts` → `node:crypto` — Node-only, and fatal in a browser bundle
 * (Vite externalizes `node:crypto` and throws the moment the binding is
 * read, even without ever calling it). Re-exporting the full barrel here
 * broke the app in every real browser until this was split out (found
 * during P9-T4's Playwright verification of the orchestration board).
 * Keep this file limited to the pure pieces `run-state.ts` needs —
 * `applyJsonPatch` (plan-amendment reconstruction) and `formatPlanDiff`
 * (the amendment banner's diff text) — plus their own dependency closure.
 */
export * from "./json-pointer.js";
export * from "./json-patch-apply.js";
export * from "./diff.js";
