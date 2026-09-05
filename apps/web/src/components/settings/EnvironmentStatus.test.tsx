import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../i18n/index.js";
import { api, type EnvironmentReport } from "../../lib/api.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { EnvironmentStatus } from "./EnvironmentStatus.js";

const HEALTHY: EnvironmentReport = {
  node: { version: "22.22.0", ok: true },
  python: { available: true, version: "3.12.1", ok: true, installInstructions: null },
  docker: { available: true },
  sandbox: { implementation: "docker", networkBlocking: true, memoryCpuCaps: "full", notes: [] },
};

describe("EnvironmentStatus (P12-T2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a green check for every capability when everything is available", async () => {
    vi.spyOn(api, "environment").mockResolvedValue(HEALTHY);
    render(<EnvironmentStatus />);
    expect(await screen.findByText(/22\.22\.0/)).toBeInTheDocument();
    expect(screen.getByText(/3\.12\.1/)).toBeInTheDocument();
  });

  it("explains that scripts are disabled, with real install instructions, when Python is missing", async () => {
    vi.spyOn(api, "environment").mockResolvedValue({
      ...HEALTHY,
      python: {
        available: false,
        version: null,
        ok: false,
        installInstructions: "התקינו Python מ-https://www.python.org/downloads/windows/",
      },
    });
    render(<EnvironmentStatus />);
    expect(await screen.findByText(/python\.org/)).toBeInTheDocument();
  });

  it("shows the real native sandbox notes when Docker is unavailable", async () => {
    vi.spyOn(api, "environment").mockResolvedValue({
      ...HEALTHY,
      docker: { available: false },
      sandbox: {
        implementation: "windows-native",
        networkBlocking: false,
        memoryCpuCaps: "partial",
        notes: ["בידוד חלקי: הסקריפטים יכולים לגשת לרשת. להגנה מלאה התקן Docker Desktop."],
      },
    });
    render(<EnvironmentStatus />);
    expect(await screen.findByText(/Docker Desktop/)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    vi.spyOn(api, "environment").mockResolvedValue(HEALTHY);
    render(<EnvironmentStatus />);
    await screen.findByText(/22\.22\.0/);
    await expectNoAxeViolations(document.body);
  });
});
