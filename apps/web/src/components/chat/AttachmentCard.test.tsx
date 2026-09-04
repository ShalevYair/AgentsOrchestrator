import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../i18n/index.js";
import type { AttachmentState } from "../../lib/attachments.js";
import { expectNoAxeViolations } from "../../test/axe.js";
import { AttachmentCard } from "./AttachmentCard.js";

function buildAttachment(overrides: Partial<AttachmentState> = {}): AttachmentState {
  return {
    id: "a.ts:100:1",
    file: new File(["x".repeat(100)], "a.ts"),
    kind: "code",
    status: "ready",
    estimatedTokens: 42,
    content: "x".repeat(100),
    ...overrides,
  };
}

describe("AttachmentCard (UX.md §2 — כרטיס קובץ מצורף)", () => {
  it("shows the real name, size, and estimated token count", () => {
    render(<AttachmentCard attachment={buildAttachment()} onRemove={vi.fn()} />);
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("100 B")).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it("shows 'not available' rather than a fabricated number for an unsupported (binary) kind", () => {
    render(
      <AttachmentCard
        attachment={buildAttachment({
          kind: "image",
          status: "unsupported",
          estimatedTokens: null,
          content: null,
        })}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("לא זמין לסוג קובץ זה")).toBeInTheDocument();
  });

  it("shows 'too large' for a file over the size cap", () => {
    render(
      <AttachmentCard
        attachment={buildAttachment({ status: "too-large", estimatedTokens: null, content: null })}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("גדול מדי להערכה")).toBeInTheDocument();
  });

  it("shows a read-error note distinct from 'not available'", () => {
    render(
      <AttachmentCard
        attachment={buildAttachment({ status: "read-error", estimatedTokens: null, content: null })}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("לא ניתן היה לקרוא את הקובץ")).toBeInTheDocument();
  });

  it("does not show a read-rung tag — no per-file rung-assignment logic exists yet", () => {
    render(<AttachmentCard attachment={buildAttachment()} onRemove={vi.fn()} />);
    expect(screen.queryByText(/R[0-5]/)).not.toBeInTheDocument();
  });

  it("clicking remove calls onRemove with this attachment's real id", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const attachment = buildAttachment({ id: "unique-id-123" });
    render(<AttachmentCard attachment={attachment} onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: /a\.ts/ }));
    expect(onRemove).toHaveBeenCalledWith("unique-id-123");
  });

  it("has no axe violations (P9-T10)", async () => {
    const { container } = render(<AttachmentCard attachment={buildAttachment()} onRemove={vi.fn()} />);
    await expectNoAxeViolations(container);
  });
});
