#!/usr/bin/env node
// P12-T8. Bumps the version field in every workspace package.json in
// lockstep — this monorepo ships one product version, not independently
// versioned packages (see CHANGELOG.md's "מדיניות גרסאות"). Only edits
// `version` fields; never touches a `workspace:*` dependency range (those
// always stay `workspace:*`, in every package, forever — that's the whole
// point of the protocol) and never touches apps/cli's `dependencies` (those
// are the real npm externals, synced separately by apps/cli/scripts/build.mjs
// from what's actually bundled, not by this script).
//
// This only edits files on disk — it does not commit, tag, or publish
// anything. Review the diff, commit it yourself, and follow RELEASING.md
// for the actual tag/publish steps.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function findWorkspacePackageJsonPaths() {
  const paths = [join(REPO_ROOT, "package.json")];
  for (const group of ["packages", "apps"]) {
    const groupDir = join(REPO_ROOT, group);
    for (const name of readdirSync(groupDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      paths.push(join(groupDir, name.name, "package.json"));
    }
  }
  return paths;
}

function main() {
  const targetVersion = process.argv[2];
  if (!targetVersion || !SEMVER_PATTERN.test(targetVersion)) {
    console.error('Usage: node scripts/bump-version.mjs <version>  (e.g. "1.0.0" or "1.0.0-rc.1")');
    process.exit(1);
  }

  const changed = [];
  for (const pkgPath of findWorkspacePackageJsonPaths()) {
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.version === targetVersion) continue;
    const previous = pkg.version;
    pkg.version = targetVersion;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    changed.push({ pkgPath, previous, next: targetVersion });
  }

  if (changed.length === 0) {
    console.log(`Every workspace package.json is already at ${targetVersion} — nothing to do.`);
    return;
  }
  console.log(`Bumped ${String(changed.length)} package.json file(s) to ${targetVersion}:`);
  for (const { pkgPath, previous } of changed) {
    console.log(`  ${pkgPath.slice(REPO_ROOT.length + 1)}: ${previous} → ${targetVersion}`);
  }
  console.log("\nNext: update CHANGELOG.md's Unreleased section, review the diff, then commit.");
}

main();
