import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startRuntime, type RunningRuntime } from "./start.js";

/**
 * Unlike server.test.ts (which builds a Fastify instance and uses
 * `.inject()`, never binding a real socket), this exercises `startRuntime`
 * for real: a real `listen()`, a real `fetch()` over loopback TCP, and real
 * `AO_DATA_DIR`-rooted SQLite/keystore files on disk — this is what P12-T1
 * actually needs proven (free-port fallback, static-file serving) and
 * `.inject()` cannot exercise either of, since both depend on a real bound
 * port and a real static-file plugin resolving real paths on disk.
 */
let dataDir: string;
let running: RunningRuntime[] = [];

afterEach(async () => {
  await Promise.all(running.map((r) => r.shutdown()));
  running = [];
  rmSync(dataDir, { recursive: true, force: true });
});

function freshDataDir(): string {
  dataDir = mkdtempSync(join(tmpdir(), "ao-start-"));
  return dataDir;
}

describe("startRuntime", () => {
  it("listens for real and answers a real HTTP request on /api/health", async () => {
    const runtime = await startRuntime({ port: 0, host: "127.0.0.1", dataDir: freshDataDir() });
    running.push(runtime);
    const res = await fetch(`http://127.0.0.1:${String(runtime.port)}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("falls back to a free port when the requested one is already taken", async () => {
    const dir = freshDataDir();
    const first = await startRuntime({ port: 0, host: "127.0.0.1", dataDir: dir });
    running.push(first);

    const second = await startRuntime({ port: first.port, host: "127.0.0.1", dataDir: dir });
    running.push(second);

    expect(second.port).not.toBe(first.port);
    const res = await fetch(`http://127.0.0.1:${String(second.port)}/api/health`);
    expect(res.status).toBe(200);
  });

  it("serves the built web UI from staticDir at / without shadowing /api routes (P12-T1)", async () => {
    const publicDir = mkdtempSync(join(tmpdir(), "ao-static-"));
    writeFileSync(join(publicDir, "index.html"), "<!doctype html><title>AO</title>");

    const runtime = await startRuntime({
      port: 0,
      host: "127.0.0.1",
      dataDir: freshDataDir(),
      staticDir: publicDir,
    });
    running.push(runtime);

    const page = await fetch(`http://127.0.0.1:${String(runtime.port)}/index.html`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>AO</title>");

    const health = await fetch(`http://127.0.0.1:${String(runtime.port)}/api/health`);
    expect(health.status).toBe(200);

    rmSync(publicDir, { recursive: true, force: true });
  });

  it("shutdown is idempotent", async () => {
    const runtime = await startRuntime({ port: 0, host: "127.0.0.1", dataDir: freshDataDir() });
    running.push(runtime);
    await runtime.shutdown();
    await expect(runtime.shutdown()).resolves.toBeUndefined();
    running = [];
  });
});
