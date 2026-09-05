import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startRuntimeMock = vi.fn();
const openBrowserMock = vi.fn();

vi.mock("@ao/runtime", () => ({ startRuntime: startRuntimeMock }));
vi.mock("./open-browser.js", () => ({ openBrowser: openBrowserMock }));

const ENV_KEYS = ["AO_AGENTS_DIR", "AO_RECIPES_DIR", "AO_NO_OPEN_BROWSER", "CI"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  startRuntimeMock.mockReset();
  openBrowserMock.mockReset();
  openBrowserMock.mockResolvedValue(true);
  startRuntimeMock.mockResolvedValue({
    port: 8787,
    host: "127.0.0.1",
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    shutdown: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.resetModules();
});

describe("cli run()", () => {
  it("starts the runtime with the bundled staticDir and parsed port/host", async () => {
    const { run } = await import("./cli.js");
    await run(["--port=3000", "--host=0.0.0.0", "--no-open"]);
    expect(startRuntimeMock).toHaveBeenCalledTimes(1);
    const passedOptions = startRuntimeMock.mock.calls[0]?.[0] as {
      port: number;
      host: string;
      staticDir: string;
    };
    expect(passedOptions.port).toBe(3000);
    expect(passedOptions.host).toBe("0.0.0.0");
    expect(passedOptions.staticDir).toContain("public");
  });

  it("sets AO_AGENTS_DIR/AO_RECIPES_DIR to bundled paths when not already set", async () => {
    const { run } = await import("./cli.js");
    await run(["--no-open"]);
    expect(process.env["AO_AGENTS_DIR"]).toMatch(/agents$/);
    expect(process.env["AO_RECIPES_DIR"]).toMatch(/recipes$/);
  });

  it("does not override AO_AGENTS_DIR/AO_RECIPES_DIR when the caller already set them", async () => {
    process.env["AO_AGENTS_DIR"] = "/custom/agents";
    process.env["AO_RECIPES_DIR"] = "/custom/recipes";
    const { run } = await import("./cli.js");
    await run(["--no-open"]);
    expect(process.env["AO_AGENTS_DIR"]).toBe("/custom/agents");
    expect(process.env["AO_RECIPES_DIR"]).toBe("/custom/recipes");
  });

  it("opens the browser by default", async () => {
    const { run } = await import("./cli.js");
    await run([]);
    expect(openBrowserMock).toHaveBeenCalledWith("http://127.0.0.1:8787/");
  });

  it("does not open the browser with --no-open", async () => {
    const { run } = await import("./cli.js");
    await run(["--no-open"]);
    expect(openBrowserMock).not.toHaveBeenCalled();
  });

  it("does not open the browser under CI=true even without --no-open", async () => {
    process.env["CI"] = "true";
    const { run } = await import("./cli.js");
    await run([]);
    expect(openBrowserMock).not.toHaveBeenCalled();
  });

  it("does not open the browser when AO_NO_OPEN_BROWSER is set", async () => {
    process.env["AO_NO_OPEN_BROWSER"] = "1";
    const { run } = await import("./cli.js");
    await run([]);
    expect(openBrowserMock).not.toHaveBeenCalled();
  });

  it("prints the loopback URL even when bound to 0.0.0.0", async () => {
    startRuntimeMock.mockResolvedValue({
      port: 9999,
      host: "0.0.0.0",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      shutdown: vi.fn().mockResolvedValue(undefined),
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { run } = await import("./cli.js");
    await run(["--no-open"]);
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("http://127.0.0.1:9999/"))).toBe(true);
    logSpy.mockRestore();
  });
});
