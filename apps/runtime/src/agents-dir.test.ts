import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveAgentsDir } from "./agents-dir.js";

describe("resolveAgentsDir", () => {
  it("returns AO_AGENTS_DIR verbatim when set, without touching the filesystem", () => {
    const result = resolveAgentsDir({
      env: { AO_AGENTS_DIR: "/somewhere/custom/agents" },
      moduleUrl: import.meta.url,
    });
    expect(result).toBe("/somewhere/custom/agents");
  });

  it("finds the real repo-root agents/ directory by walking up from this module's own location", () => {
    const result = resolveAgentsDir({ env: {}, moduleUrl: import.meta.url });
    expect(basename(result)).toBe("agents");
    // dirname(result) is the repo root — it really does hold pnpm-workspace.yaml
    // (proven directly by @ao/platform's own findWorkspaceRoot tests; here we
    // just confirm resolveAgentsDir composes it with "agents" correctly).
    expect(dirname(result)).toBe(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
  });
});
