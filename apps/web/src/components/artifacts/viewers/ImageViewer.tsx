import * as React from "react";
import { useTranslation } from "react-i18next";

export interface ImageViewerProps {
  /** A ready-to-render image source — a data: URI or blob: URL. Building that from raw bytes is the caller's job (this component stays a pure presenter, same as `Markdown`/`CodeBlock`). */
  src: string;
  name: string;
}

/** P8-T8's "תמונה" preview. */
export function ImageViewer({ src, name }: ImageViewerProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900">
      <img src={src} alt={t("artifacts.imageAlt", { name })} className="max-h-96 max-w-full object-contain" />
    </div>
  );
}
