import * as React from "react";
import { unzipSync } from "fflate";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../../lib/artifact-kind.js";
import { downloadBlob } from "../../../lib/download.js";
import { Button } from "../../ui/button.js";
import { Archive, Download } from "../../ui/icons.js";

export interface ZipViewerProps {
  data: Uint8Array;
  filename: string;
}

interface ZipEntry {
  path: string;
  size: number;
}

/** P8-T8's "ZIP" preview: lists the archive's entries (name + size) without ever writing them to disk, plus a one-click download of the raw archive bytes. */
export function ZipViewer({ data, filename }: ZipViewerProps): React.JSX.Element {
  const { t } = useTranslation();
  const entries = React.useMemo<ZipEntry[]>(() => {
    try {
      const unzipped = unzipSync(data);
      return Object.entries(unzipped)
        .filter(([path]) => !path.endsWith("/")) // directory entries carry no useful size
        .map(([path, bytes]) => ({ path, size: bytes.length }));
    } catch {
      return [];
    }
  }, [data]);

  const handleDownload = (): void => {
    downloadBlob(filename, data, "application/zip");
  };

  return (
    <div className="space-y-2">
      <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          {entries.map((entry) => (
            <li key={entry.path} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="flex items-center gap-1.5 truncate">
                <Archive className="shrink-0 text-neutral-400" />
                <span className="truncate">{entry.path}</span>
              </span>
              <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
                {formatBytes(entry.size)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {t("artifacts.zipEntryCount", { count: entries.length })}
      </p>
      <Button variant="outline" size="sm" onClick={handleDownload}>
        <Download />
        <span>{t("artifacts.download")}</span>
      </Button>
    </div>
  );
}
