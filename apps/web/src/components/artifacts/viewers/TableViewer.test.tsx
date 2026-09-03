import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../../i18n/index.js";
import { downloadBlob } from "../../../lib/download.js";
import { TableViewer } from "./TableViewer.js";

vi.mock("../../../lib/download.js", () => ({ downloadBlob: vi.fn() }));

describe("TableViewer", () => {
  it("renders headers from the first row's keys and every row's values", () => {
    render(
      <TableViewer
        rows={[
          { name: "a", count: 1 },
          { name: "b", count: 2 },
        ]}
        filename="report"
      />,
    );
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("count")).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows an empty-state message instead of a table for zero rows", () => {
    render(<TableViewer rows={[]} filename="report" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("downloads the exact rows as CSV, named after the artifact, on button click", async () => {
    const user = userEvent.setup();
    render(<TableViewer rows={[{ name: "a", count: 1 }]} filename="report" />);

    await user.click(screen.getByRole("button"));

    expect(downloadBlob).toHaveBeenCalledWith("report.csv", "name,count\na,1", "text/csv;charset=utf-8");
  });
});
