import { probeCapabilities } from "./capabilities.js";
import { DarwinSandbox } from "./darwin-sandbox.js";
import { LinuxSandbox } from "./linux-sandbox.js";
import type { Sandbox } from "./types.js";
import { WindowsSandbox } from "./windows-sandbox.js";

/** Picks (and probes) the right `Sandbox` implementation for the running platform. */
export function detectSandbox(platform: NodeJS.Platform = process.platform): Sandbox {
  if (platform === "win32") return new WindowsSandbox(probeCapabilities("win32"));
  if (platform === "darwin") return new DarwinSandbox(probeCapabilities("darwin"));
  return new LinuxSandbox(probeCapabilities("linux"));
}
