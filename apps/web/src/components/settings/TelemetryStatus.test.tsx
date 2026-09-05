import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { TelemetryStatus } from "./TelemetryStatus.js";

describe("TelemetryStatus (P12-T7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows disabled (the default) when telemetry is off", async () => {
    vi.spyOn(api, "health").mockResolvedValue({
      status: "ok",
      provider: "mock",
      model: "gemini-3.7-flash",
      telemetryEnabled: false,
    });
    render(<TelemetryStatus />);
    expect(await screen.findByText(/כבויה \(ברירת מחדל\)/)).toBeInTheDocument();
  });

  it("shows enabled when telemetry is on", async () => {
    vi.spyOn(api, "health").mockResolvedValue({
      status: "ok",
      provider: "mock",
      model: "gemini-3.7-flash",
      telemetryEnabled: true,
    });
    render(<TelemetryStatus />);
    expect(await screen.findByText("פעילה")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    vi.spyOn(api, "health").mockResolvedValue({
      status: "ok",
      provider: "mock",
      model: "gemini-3.7-flash",
      telemetryEnabled: false,
    });
    render(<TelemetryStatus />);
    await screen.findByText(/כבויה/);
    await expectNoAxeViolations(document.body);
  });
});
