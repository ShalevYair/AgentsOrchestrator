import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../i18n/index.js";
import { Markdown } from "./Markdown.js";

// P2-T5 / UX.md §9's required test case doesn't need real syntax
// highlighting — only that the LTR-container structure is correct — and
// this repo's own rule is zero network calls in tests, so shiki (which
// dynamically loads per-language/theme assets) is stubbed out.
vi.mock("shiki", () => ({
  codeToHtml: (code: string) => Promise.resolve(`<pre><code>${code}</code></pre>`),
}));

describe("Markdown bidi rendering (UX.md §9)", () => {
  it('wraps inline code in a Hebrew paragraph with <bdi dir="ltr">, without setting dir on the paragraph itself', () => {
    render(<Markdown content="פסקה בעברית עם מונח אנגלי כמו `useEffect` בתוך המשפט." />);

    const inlineCode = screen.getByText("useEffect");
    const bdi = inlineCode.closest("bdi");
    expect(bdi).not.toBeNull();
    expect(bdi).toHaveAttribute("dir", "ltr");

    const paragraph = inlineCode.closest("p");
    expect(paragraph).not.toBeNull();
    // The paragraph inherits its direction from the surrounding app shell
    // (RTL by default) — it must NOT itself be forced ltr; only the code
    // island should be.
    expect(paragraph).not.toHaveAttribute("dir");
  });

  it('renders a fenced code block inside a dir="ltr" container even inside RTL flow', () => {
    const content = ["פסקה בעברית שמסבירה קוד:", "", "```ts", "const x: number = 1;", "```"].join("\n");
    const { container } = render(<Markdown content={content} />);

    // CodeBlock.tsx's outer wrapper renders synchronously with dir="ltr"
    // regardless of Shiki's async highlighting having resolved yet.
    const ltrContainers = container.querySelectorAll('[dir="ltr"]');
    expect(ltrContainers.length).toBeGreaterThan(0);
    const codeContainer = Array.from(ltrContainers).find((el) => el.textContent?.includes("const x"));
    expect(codeContainer).toBeDefined();
  });

  it("uses <bdi> for a Hebrew sentence containing a file path (another LTR-island case)", () => {
    render(<Markdown content="הקובץ נמצא בנתיב `src/index.ts` בתיקיית השורש." />);
    const code = screen.getByText("src/index.ts");
    expect(code.closest("bdi")).toHaveAttribute("dir", "ltr");
  });
});
