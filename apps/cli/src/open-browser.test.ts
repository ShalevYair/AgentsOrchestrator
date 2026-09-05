import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { openBrowser } from "./open-browser.js";

function fakeChild(): EventEmitter & { unref: () => void } {
  const child = new EventEmitter() as EventEmitter & { unref: () => void };
  child.unref = vi.fn();
  return child;
}

describe("openBrowser", () => {
  it('uses `cmd /c start "" <url>` on win32 — argv, never a shell string', async () => {
    const child = fakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const promise = openBrowser("http://127.0.0.1:8787/", { spawnFn, platform: "win32" });
    child.emit("spawn");
    expect(await promise).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith(
      "cmd",
      ["/c", "start", "", "http://127.0.0.1:8787/"],
      expect.objectContaining({ stdio: "ignore" }),
    );
  });

  it("uses `open` on darwin", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const promise = openBrowser("http://127.0.0.1:8787/", { spawnFn, platform: "darwin" });
    child.emit("spawn");
    expect(await promise).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith("open", ["http://127.0.0.1:8787/"], expect.anything());
  });

  it("uses `xdg-open` on linux", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const promise = openBrowser("http://127.0.0.1:8787/", { spawnFn, platform: "linux" });
    child.emit("spawn");
    expect(await promise).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith("xdg-open", ["http://127.0.0.1:8787/"], expect.anything());
  });

  it("resolves false (never throws/rejects) when the OS has no opener — headless CI", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const promise = openBrowser("http://127.0.0.1:8787/", { spawnFn, platform: "linux" });
    child.emit("error", new Error("ENOENT: xdg-open not found"));
    expect(await promise).toBe(false);
  });

  it("resolves false if spawn itself throws synchronously", async () => {
    const spawnFn = vi.fn().mockImplementation(() => {
      throw new Error("boom");
    });
    expect(await openBrowser("http://127.0.0.1:8787/", { spawnFn, platform: "linux" })).toBe(false);
  });
});
