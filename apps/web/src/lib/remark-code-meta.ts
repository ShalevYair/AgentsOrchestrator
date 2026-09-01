import { visit } from "unist-util-visit";
import type { Node } from "unist";

interface CodeNode extends Node {
  type: "code";
  meta?: string | null;
  data?: { hProperties?: Record<string, unknown> };
}

/**
 * remark-rehype drops a fenced code block's info-string "meta" (everything
 * after the language, e.g. ```ts filename="app.ts") by default. This tiny
 * plugin copies it onto the hast node as a `data-meta` attribute so
 * Markdown.tsx's `code` renderer can read it back out and show a filename
 * (UX.md §6 / P2-T5) — see mdast-util-to-hast's `hProperties` mechanism.
 */
export function remarkCodeMeta() {
  return (tree: Node): void => {
    visit(tree, "code", (node) => {
      const codeNode = node as CodeNode;
      const hProperties = codeNode.data?.hProperties ?? {};
      codeNode.data = { ...codeNode.data, hProperties: { ...hProperties, "data-meta": codeNode.meta ?? "" } };
    });
  };
}
