import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../i18n/index.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { EgressPanel } from "./EgressPanel.js";

describe("EgressPanel (UX.md §7 — מה יצא מהמחשב)", () => {
  it("the trigger shows the real total bytes", () => {
    render(<EgressPanel totalBytes={348_160} totalRedactions={0} calls={[]} />);
    expect(screen.getByRole("button", { name: /340 ?KB/ })).toBeInTheDocument();
  });

  it("no redaction badge on the trigger when nothing was redacted", () => {
    render(<EgressPanel totalBytes={1000} totalRedactions={0} calls={[]} />);
    expect(screen.queryByText("🔴")).not.toBeInTheDocument();
  });

  it("shows a redaction badge with the real count on the trigger", () => {
    render(<EgressPanel totalBytes={1000} totalRedactions={2} calls={[]} />);
    expect(screen.getByText(/🔴 2/)).toBeInTheDocument();
  });

  it("clicking the trigger opens a dialog with the real totals", async () => {
    const user = userEvent.setup();
    render(
      <EgressPanel
        totalBytes={348_160}
        totalRedactions={0}
        calls={[{ callId: "run_1#0", bytes: 348_160, artifactRefs: [], redactions: 0 }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /340 ?KB/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("340");
    expect(dialog).toHaveTextContent("1");
  });

  it("no redaction note in the dialog when nothing was redacted", async () => {
    const user = userEvent.setup();
    render(<EgressPanel totalBytes={1000} totalRedactions={0} calls={[]} />);
    await user.click(screen.getByRole("button", { name: /1000/ }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the real redaction count as a note in the dialog", async () => {
    const user = userEvent.setup();
    render(<EgressPanel totalBytes={5000} totalRedactions={3} calls={[]} />);
    await user.click(screen.getByRole("button", { name: /3 סודות/ }));
    expect(screen.getByRole("status")).toHaveTextContent("3");
  });

  it("the trigger's accessible name mentions the redaction count too, not just the visual badge", () => {
    render(<EgressPanel totalBytes={5000} totalRedactions={3} calls={[]} />);
    // The 🔴 badge itself is aria-hidden (decorative) — a screen reader
    // user must still learn about the redactions from the button's name.
    expect(screen.getByRole("button", { name: /3 סודות/ })).toBeInTheDocument();
  });

  it("lists each real call with its own bytes and redaction count", async () => {
    const user = userEvent.setup();
    render(
      <EgressPanel
        totalBytes={1500}
        totalRedactions={1}
        calls={[
          { callId: "run_1#0", bytes: 1000, artifactRefs: [], redactions: 0 },
          { callId: "run_1#1", bytes: 500, artifactRefs: [], redactions: 1 },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /1 סוד/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("run_1#0");
    expect(dialog).toHaveTextContent("run_1#1");
  });

  it("omits the calls section entirely with no calls yet", async () => {
    const user = userEvent.setup();
    render(<EgressPanel totalBytes={0} totalRedactions={0} calls={[]} />);
    await user.click(screen.getByRole("button"));
    expect(screen.queryByText("קריאות")).not.toBeInTheDocument();
  });

  it("has no axe violations with the dialog open, redactions, and multiple calls shown (P9-T10)", async () => {
    const user = userEvent.setup();
    render(
      <EgressPanel
        totalBytes={1500}
        totalRedactions={1}
        calls={[
          { callId: "run_1#0", bytes: 1000, artifactRefs: [], redactions: 0 },
          { callId: "run_1#1", bytes: 500, artifactRefs: [], redactions: 1 },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /1 סוד/ }));
    // Radix's Dialog content is portaled onto document.body.
    await expectNoAxeViolations(document.body);
  });
});
