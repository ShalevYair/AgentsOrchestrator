import * as React from "react";
import { useTranslation } from "react-i18next";
import { downloadBlob } from "../../../lib/download.js";
import { cellToText, rowsToCsv } from "../../../lib/csv.js";
import { Button } from "../../ui/button.js";
import { Download } from "../../ui/icons.js";

export interface TableViewerProps {
  rows: readonly Record<string, unknown>[];
  /** Base filename (without `.csv`) offered for the CSV download. */
  filename: string;
}

/** P8-T8's "טבלה ל-CSV" preview: renders the rows as an HTML table, with a CSV download of the exact same data. */
export function TableViewer({ rows, filename }: TableViewerProps): React.JSX.Element {
  const { t } = useTranslation();
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];

  const handleDownloadCsv = (): void => {
    downloadBlob(`${filename}.csv`, rowsToCsv(rows), "text/csv;charset=utf-8");
  };

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("artifacts.emptyTable")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-start text-sm">
          <thead className="bg-neutral-100 dark:bg-neutral-800">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-3 py-1.5 text-start font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-neutral-200 dark:border-neutral-800">
                {headers.map((header) => (
                  <td key={header} className="px-3 py-1.5">
                    {cellToText(row[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={handleDownloadCsv}>
        <Download />
        <span>{t("artifacts.download")} CSV</span>
      </Button>
    </div>
  );
}
