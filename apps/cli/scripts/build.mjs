#!/usr/bin/env node
// P12-T1. Produces the standalone `agents-orchestrator` package: bundles
// `src/cli.ts` (and every `@ao/*` workspace package it transitively pulls
// in) into one `dist/cli.js`, then copies the two things that can't be
// bundled as JS — the built web UI and the `agents/`/`recipes/` data
// directories — alongside it. None of the `@ao/*` packages are published
// to npm (all `"private": true`), so this is the only way a real
// `npm install agents-orchestrator` ever gets working code: everything
// internal must already be inlined into `dist/cli.js` by the time it ships.
//
// `apps/web` is listed as a devDependency in package.json purely so pnpm's
// topological `-r run build` builds it before this script runs — this
// script's own copy step needs `apps/web/dist` to already exist, even
// though `cli.ts` never imports anything from `@ao/web` as code.
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(CLI_DIR));

/** Every internal package whose *compiled* source (`dist/*.js`) esbuild inlines into the one bundle — must already be built. */
const INTERNAL_PACKAGE_DIRS = [
  "packages/shared",
  "packages/platform",
  "packages/providers",
  "packages/core",
  "packages/tools",
  "apps/runtime",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Collects every *real* npm dependency (never an `@ao/*` workspace
 * package — those get inlined, not installed) across the whole bundled
 * closure, so the published `dependencies` field can never silently drift
 * from what the bundle actually needs. Throws on a version-range conflict
 * between two internal packages declaring the same dependency differently
 * — this repo has one lockfile, so that should never actually happen; if
 * it does, this is exactly the kind of bug that must fail loud at build
 * time, not ship a package.json with an arbitrarily-chosen range.
 */
function collectExternalDependencies() {
  const externals = new Map();
  for (const dir of INTERNAL_PACKAGE_DIRS) {
    const pkg = readJson(join(REPO_ROOT, dir, "package.json"));
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      if (name.startsWith("@ao/")) continue;
      const existing = externals.get(name);
      if (existing !== undefined && existing !== range) {
        throw new Error(
          `dependency "${name}" has conflicting version ranges across the bundled closure: "${existing}" vs "${range}" (from ${dir}) — resolve this in the source packages before building the CLI.`,
        );
      }
      externals.set(name, range);
    }
  }
  return externals;
}

function syncPackageJsonDependencies(externals) {
  const pkgPath = join(CLI_DIR, "package.json");
  const pkg = readJson(pkgPath);
  pkg.dependencies = Object.fromEntries([...externals.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function assertBuilt(dir, whatFailedToBuild) {
  if (!existsSync(dir)) {
    throw new Error(
      `expected ${dir} to exist — run "pnpm build" first (${whatFailedToBuild} isn't built yet).`,
    );
  }
}

async function bundle(externals) {
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [join(CLI_DIR, "src/cli.ts")],
    outfile: join(CLI_DIR, "dist/cli.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: [...externals.keys()],
    banner: { js: "#!/usr/bin/env node" },
    // The internal `@ao/*` packages resolve to their own `dist/*.js` (see
    // each package's `main`/`exports`) via plain node_modules resolution —
    // nothing special needed here for esbuild to find and inline them.
  });
  chmodSync(join(CLI_DIR, "dist/cli.js"), 0o755);
}

function copyStaticAssets() {
  const webDist = join(REPO_ROOT, "apps/web/dist");
  assertBuilt(webDist, "apps/web");
  cpSync(webDist, join(CLI_DIR, "dist/public"), { recursive: true });

  for (const name of ["agents", "recipes"]) {
    const source = join(REPO_ROOT, name);
    assertBuilt(source, name);
    cpSync(source, join(CLI_DIR, `dist/${name}`), { recursive: true });
  }
}

function main() {
  rmSync(join(CLI_DIR, "dist"), { recursive: true, force: true });
  mkdirSync(join(CLI_DIR, "dist"), { recursive: true });

  for (const dir of INTERNAL_PACKAGE_DIRS) {
    assertBuilt(join(REPO_ROOT, dir, "dist"), dir);
  }

  const externals = collectExternalDependencies();
  syncPackageJsonDependencies(externals);
  copyStaticAssets();
  return bundle(externals);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
