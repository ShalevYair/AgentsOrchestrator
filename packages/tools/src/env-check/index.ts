import { discoverPython, meetsMinimumPythonVersion, MINIMUM_PYTHON_VERSION } from "@ao/platform";
import { probeDockerAvailable } from "../sandbox/docker-sandbox.js";
import { detectSandbox } from "../sandbox/detect.js";
import { pythonInstallInstructions } from "./python-install-instructions.js";
import type { DockerCheck, EnvironmentReport, NodeCheck, PythonCheck } from "./types.js";

export { pythonInstallInstructions } from "./python-install-instructions.js";
export type { DockerCheck, EnvironmentReport, NodeCheck, PythonCheck } from "./types.js";

const MIN_NODE_MAJOR_VERSION = 22;

export function checkNode(nodeVersion: string = process.versions.node): NodeCheck {
  const majorVersion = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10) || 0;
  return {
    version: nodeVersion,
    majorVersion,
    minMajorVersion: MIN_NODE_MAJOR_VERSION,
    ok: majorVersion >= MIN_NODE_MAJOR_VERSION,
  };
}

export function checkPython(platform: NodeJS.Platform = process.platform): PythonCheck {
  const interpreter = discoverPython();
  if (!interpreter) {
    return {
      available: false,
      version: null,
      command: null,
      minVersion: MINIMUM_PYTHON_VERSION,
      ok: false,
      installInstructions: pythonInstallInstructions(platform),
    };
  }
  const ok = meetsMinimumPythonVersion(interpreter.version);
  return {
    available: true,
    version: interpreter.version,
    command: interpreter.command,
    minVersion: MINIMUM_PYTHON_VERSION,
    ok,
    installInstructions: ok
      ? null
      : `נמצא Python ${interpreter.version}, נדרש ${MINIMUM_PYTHON_VERSION} ומעלה. ${pythonInstallInstructions(platform)}`,
  };
}

export function checkDocker(): DockerCheck {
  return { available: probeDockerAvailable() };
}

/**
 * Composes the individual probes (`discoverPython`, `probeDockerAvailable`,
 * `detectSandbox`) into one report. Every probe underneath already
 * degrades gracefully instead of throwing (ENOENT/timeout → `false`/`null`),
 * so this function does too — there is no code path here that can crash
 * app startup because a tool is missing, only fields reporting that it is.
 */
export function checkEnvironment(platform: NodeJS.Platform = process.platform): EnvironmentReport {
  return {
    node: checkNode(),
    python: checkPython(platform),
    docker: checkDocker(),
    sandbox: detectSandbox(platform).capabilities,
  };
}
