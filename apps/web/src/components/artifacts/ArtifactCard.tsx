import * as React from "react";
import { useTranslation } from "react-i18next";
import { classifyArtifactViewer, formatBytes, shikiLangFor } from "../../lib/artifact-kind.js";
import { parseCsv } from "../../lib/csv.js";
import { downloadBlob } from "../../lib/download.js";
import { cn } from "../../lib/utils.js";
import { CodeBlock } from "../chat/CodeBlock.js";
import { Markdown } from "../chat/Markdown.js";
import { Button } from "../ui/button.js";
import { Download } from "../ui/icons.js";
import { DiffViewer } from "./viewers/DiffViewer.js";
import { ImageViewer } from "./viewers/ImageViewer.js";
import { TableViewer } from "./viewers/TableViewer.js";
import { ZipViewer } from "./viewers/ZipViewer.js";

export interface ArtifactCardProps {
  /** Display name — usually the last path segment. */
  name: string;
  /** Full relative path (used for the code-block filename label and CSV/ZIP download names). */
  path: string;
  data: Uint8Array;
  /** Unified-diff text (`@ao/core`'s `formatUnifiedDiff`) against the prior version — UX.md §6's "if this is an update". Absent for a brand-new artifact. */
  diffText?: string;
  /** UX.md §6: "כתוב לתיקייה (רק בהרשאה)" — the button only renders when the caller says this artifact is write-eligible; the actual write flow (diff → approval → backup, P8-T7) is driven by the caller, this card just surfaces the entry point. */
  onWriteToFolder?: () => void;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/**
 * P8-T8 — UX.md §6's "כרטיס ארטיפקט": name + kind badge + size, a preview
 * that switches by `classifyArtifactViewer` (code / Markdown / image /
 * table→CSV / zip / plain text), an optional diff section when this is an
 * update, and download (single here; batch download is `ArtifactGroup`'s
 * job, over several cards at once).
 */
export function ArtifactCard({
  name,
  path,
  data,
  diffText,
  onWriteToFolder,
}: ArtifactCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const [showDiff, setShowDiff] = React.useState(false);
  const kind = classifyArtifactViewer(name);

  const handleDownload = (): void => {
    downloadBlob(name, data, guessMimeType(name));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex min-w-0 items-center gap-2">
          <span dir="ltr" className="truncate font-mono text-sm">
            {path}
          </span>
          <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
            {t(`artifacts.kind.${kind}`)}
          </span>
          <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
            {formatBytes(data.length)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {diffText !== undefined && diffText.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? t("artifacts.hideDiff") : t("artifacts.showDiff")}
            </Button>
          )}
          {onWriteToFolder && (
            <Button variant="outline" size="sm" onClick={onWriteToFolder}>
              {t("artifacts.writeToFolder")}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleDownload} aria-label={t("artifacts.download")}>
            <Download />
          </Button>
        </div>
      </div>

      {showDiff && diffText !== undefined && (
        <div className="border-b border-neutral-200 p-2 dark:border-neutral-800">
          <DiffViewer diffText={diffText} />
        </div>
      )}

      <div className={cn("p-2", kind === "code" || kind === "text" ? "p-0" : "")}>
        <ArtifactBody kind={kind} name={name} path={path} data={data} />
      </div>
    </div>
  );
}

function decodeUtf8(data: Uint8Array): string {
  return new TextDecoder("utf-8").decode(data);
}

interface ArtifactBodyProps {
  kind: ReturnType<typeof classifyArtifactViewer>;
  name: string;
  path: string;
  data: Uint8Array;
}

function ArtifactBody({ kind, name, path, data }: ArtifactBodyProps): React.JSX.Element {
  switch (kind) {
    case "markdown":
      return <Markdown content={decodeUtf8(data)} />;
    case "image":
      return <ImageViewer src={`data:${guessMimeType(name)};base64,${toBase64(data)}`} name={name} />;
    case "table":
      return (
        <TableViewer rows={parseCsv(decodeUtf8(data), path.endsWith(".tsv") ? "\t" : ",")} filename={name} />
      );
    case "zip":
      return <ZipViewer data={data} filename={name} />;
    case "code":
      return <CodeBlock code={decodeUtf8(data)} lang={shikiLangFor(name)} filename={path} />;
    case "text":
      return <CodeBlock code={decodeUtf8(data)} lang="text" filename={path} />;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
