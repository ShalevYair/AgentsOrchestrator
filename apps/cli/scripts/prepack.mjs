#!/usr/bin/env node
// `devDependencies` here are all `workspace:*` (needed for local pnpm builds
// to resolve the `@ao/*` sources this package bundles) — meaningless outside
// this monorepo, and `workspace:` is not a protocol any plain `npm install`
// understands. `npm pack`/`npm publish` never installs a package's own
// devDependencies for a consumer anyway, but shipping an unresolvable
// protocol string in a published manifest is still a landmine (for anyone
// who inspects it, or runs a bare install *inside* the extracted package
// out of confusion) — stripped here, restored by postpack.mjs right after.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgPath = join(CLI_DIR, "package.json");
const backupPath = join(CLI_DIR, "package.json.prepack-backup");

const original = readFileSync(pkgPath, "utf8");
writeFileSync(backupPath, original);

const pkg = JSON.parse(original);
delete pkg.devDependencies;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
