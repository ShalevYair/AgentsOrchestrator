#!/usr/bin/env node
// P12-T1's CI "done" bar: start the real bundled dist/cli.js as a real
// child process and get a real response from a real endpoint. A plain Node
// script (not a shell script) on purpose — this runs identically via
// `node smoke-test.mjs` whether the CI runner's default shell is bash
// (ubuntu/macos) or PowerShell (windows-latest), no shell-specific syntax
// or `shell: true` spawning anywhere (ADR-011's "no shell assumption").
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI_ENTRY = join(CLI_DIR, "dist", "cli.js");
const READY_TIMEOUT_MS = 15_000;
const READY_PATTERN = /is running at (http:\/\/\S+)/;

/**
 * `child.kill()` alone is not enough before deleting `dataDir`: on Windows,
 * `child_process.kill()` maps to `TerminateProcess()` (POSIX signal
 * handlers, including this CLI's own graceful-shutdown SIGTERM handler,
 * never run) and — separately from that — killing is asynchronous either
 * way, so the very next line can run before the OS has actually released
 * the process's open `ao.sqlite3` handle. Observed for real on CI's
 * windows-latest: the smoke test's own health/page checks passed, then
 * cleanup failed with `EBUSY: resource busy or locked, unlink ...
 * ao.sqlite3` because `rmSync` ran immediately after `kill()` instead of
 * after the process was actually confirmed gone.
 */
function killAndWait(child, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(
        new Error(`CLI did not report ready within ${String(READY_TIMEOUT_MS)}ms. Output so far:\n${output}`),
      );
    }, READY_TIMEOUT_MS);

    const onData = (chunk) => {
      output += chunk.toString();
      const match = READY_PATTERN.exec(output);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited early (code ${String(code)}) before reporting ready. Output:\n${output}`));
    });
  });
}

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), "ao-smoke-"));
  const child = spawn(process.execPath, [CLI_ENTRY, "--port=0", "--no-open"], {
    env: { ...process.env, AO_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const url = await waitForReady(child);
    console.log(`smoke test: CLI reports ready at ${url}`);

    const res = await fetch(new URL("/api/health", url));
    if (res.status !== 200) {
      throw new Error(`GET /api/health returned ${String(res.status)}, expected 200`);
    }
    const body = await res.json();
    if (body.status !== "ok") {
      throw new Error(`unexpected /api/health body: ${JSON.stringify(body)}`);
    }

    const page = await fetch(url);
    if (page.status !== 200) {
      throw new Error(`GET ${url} (the served web UI) returned ${String(page.status)}, expected 200`);
    }

    console.log("smoke test: /api/health and / both responded correctly — PASS");
  } finally {
    await killAndWait(child);
    // maxRetries/retryDelay: even after the process is confirmed exited,
    // Windows can lag briefly before the OS fully releases the file handle
    // (antivirus scanning, delayed handle teardown) — belt-and-suspenders
    // alongside killAndWait, not a substitute for it.
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error("smoke test FAILED:", error.message ?? error);
  process.exit(1);
});
