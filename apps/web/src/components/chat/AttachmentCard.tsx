import * as React from "react";
import { useTranslation } from "react-i18next";
import type { ArtifactViewerKind } from "../../lib/artifact-kind.js";
import { formatBytes } from "../../lib/artifact-kind.js";
import type { AttachmentState } from "../../lib/attachments.js";
import { formatTokenCount } from "../../lib/cost.js";
import { Archive, FileText, ImageIcon, X } from "../ui/icons.js";

export interface AttachmentCardProps {
  attachment: AttachmentState;
  onRemove: (id: string) => void;
}

const KIND_ICON: Record<ArtifactViewerKind, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  code: FileText,
  markdown: FileText,
  text: FileText,
  table: FileText,
  image: ImageIcon,
  zip: Archive,
};

/**
 * UX.md §2's "כרטיס קובץ מצורף": icon by type · name · size · estimated
 * tokens — shown *before* sending, real numbers from `buildAttachmentState`
 * (`lib/attachments.ts`), never a placeholder. Deliberately has no read-rung
 * tag: UX.md's mockup shows one (R1/R4/R5), but no per-file rung-assignment
 * algorithm exists anywhere in this codebase — read rung is a *planner*
 * decision (relevance-to-task scoring against a real request), not a
 * file-intrinsic property, and there's no real planner run to ask yet
 * (same documented gap as P9-T1/T3/T7). Showing a fixed/fake tag here
 * would misrepresent a decision nothing has actually made.
 */
export function AttachmentCard({ attachment, onRemove }: AttachmentCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = KIND_ICON[attachment.kind];

  return (
    <div className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-800">
      <Icon aria-hidden="true" className="shrink-0 text-neutral-500 dark:text-neutral-400" />
      <bdi className="min-w-0 flex-1 truncate font-medium">{attachment.file.name}</bdi>
      <bdi className="shrink-0 text-neutral-500 dark:text-neutral-400">
        {formatBytes(attachment.file.size)}
      </bdi>
      <bdi className="shrink-0 text-neutral-500 dark:text-neutral-400">
        {attachment.status === "ready" && attachment.estimatedTokens !== null
          ? t("attachment.tokens", { tokens: formatTokenCount(attachment.estimatedTokens) })
          : attachment.status === "too-large"
            ? t("attachment.tooLarge")
            : attachment.status === "read-error"
              ? t("attachment.readError")
              : t("attachment.notEstimated")}
      </bdi>
      <button
        type="button"
        onClick={() => {
          onRemove(attachment.id);
        }}
        aria-label={t("attachment.remove", { name: attachment.file.name })}
        className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        <X />
      </button>
    </div>
  );
}
