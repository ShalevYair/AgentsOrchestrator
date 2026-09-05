import { spawn } from "node:child_process";

export interface OpenBrowserDeps {
  spawnFn: typeof spawn;
  platform: NodeJS.Platform;
}

function commandFor(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "win32") {
    // `cmd /c start "" <url>` — the empty "" is required: `start` treats its
    // first quoted argument as the new window's title, not the target, so
    // without it a title-like first token would swallow the real URL. This
    // is argv, never a shell string, so no quoting/escaping is needed for
    // spaces or `&` in the URL itself.
    return ["cmd", ["/c", "start", "", url]];
  }
  if (platform === "darwin") {
    return ["open", [url]];
  }
  return ["xdg-open", [url]];
}

/**
 * P12-T1: best-effort "open the OS default browser at this URL". The
 * server is already listening either way by the time this is called, so a
 * failure here (headless CI, no `xdg-open`, no display) is reported back as
 * `false`, never thrown — the caller prints the URL so the user can open it
 * by hand.
 */
export function openBrowser(url: string, deps: Partial<OpenBrowserDeps> = {}): Promise<boolean> {
  const spawnFn = deps.spawnFn ?? spawn;
  const platform = deps.platform ?? process.platform;
  const [command, args] = commandFor(platform, url);

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawnFn(command, args, { stdio: "ignore", windowsHide: true });
    } catch {
      resolve(false);
      return;
    }
    child.once("error", () => {
      resolve(false);
    });
    child.once("spawn", () => {
      resolve(true);
    });
    child.unref();
  });
}
