import * as React from "react";
import { useTranslation } from "react-i18next";
import { downloadFilesAsZip } from "../../lib/download.js";
import { Button } from "../ui/button.js";
import { Download } from "../ui/icons.js";
import { ArtifactCard, type ArtifactCardProps } from "./ArtifactCard.js";

export interface ArtifactGroupItem extends Omit<ArtifactCardProps, "onWriteToFolder"> {
  id: string;
  writable?: boolean;
}

export interface ArtifactGroupProps {
  artifacts: readonly ArtifactGroupItem[];
  /** Bundle filename for the "download all" ZIP. */
  zipFilename: string;
  onWriteToFolder?: (artifact: ArtifactGroupItem) => void;
}

/** P8-T8's "הורדה … קבוצתית": renders one `ArtifactCard` per artifact plus a single "download all as ZIP" action over the whole group — zipped client-side, no server round-trip for bytes the browser already has. */
export function ArtifactGroup({
  artifacts,
  zipFilename,
  onWriteToFolder,
}: ArtifactGroupProps): React.JSX.Element {
  const { t } = useTranslation();

  const handleDownloadAll = (): void => {
    downloadFilesAsZip(
      zipFilename,
      artifacts.map((a) => ({ path: a.path, data: a.data })),
    );
  };

  return (
    <div className="space-y-2">
      {artifacts.length > 1 && (
        <Button variant="outline" size="sm" onClick={handleDownloadAll}>
          <Download />
          <span>{t("artifacts.downloadAll")}</span>
        </Button>
      )}
      <div className="space-y-2">
        {artifacts.map((artifact) => {
          const writeHandler =
            artifact.writable && onWriteToFolder ? () => onWriteToFolder(artifact) : undefined;
          return writeHandler ? (
            <ArtifactCard key={artifact.id} {...artifact} onWriteToFolder={writeHandler} />
          ) : (
            <ArtifactCard key={artifact.id} {...artifact} />
          );
        })}
      </div>
    </div>
  );
}
