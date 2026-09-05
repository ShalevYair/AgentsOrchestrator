#!/usr/bin/env node
// Restores the working tree's real package.json (with devDependencies)
// right after `npm pack`/`npm publish` reads the stripped version — see
// prepack.mjs. Runs even if packing failed partway, as long as npm got far
// enough to invoke prepack in the first place.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgPath = join(CLI_DIR, "package.json");
const backupPath = join(CLI_DIR, "package.json.prepack-backup");

if (existsSync(backupPath)) {
  writeFileSync(pkgPath, readFileSync(backupPath, "utf8"));
  unlinkSync(backupPath);
} else {
  console.warn("postpack: no package.json.prepack-backup found — nothing to restore.");
}
