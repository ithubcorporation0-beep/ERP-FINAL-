import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/tables/data-table";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { createDataTableColumns } from "@/components/tables/data-table-features";

interface Item {
  id: string;
  name: string;
  qty: number;
}

const col = createDataTableColumns<Item>();
const columns = col.columns([
  col.accessor("name", { header: ({ column }) => <DataTableColumnHeader column={column} title="Name" /> }),
  col.accessor("qty", { header: "Qty", enableSorting: false }),
]);
const data: Item[] = [
  { id: "1", name: "Bravo", qty: 2 },
  { id: "2", name: "Alpha", qty: 5 },
  { id: "3", name: "Charlie", qty: 1 },
];

function bodyNames() {
  const rows = screen.getAllByRole("row").slice(1);
  return rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent);
}

describe("DataTable", () => {
  it("renders rows with an accessible caption", () => {
    render(<DataTable caption="Items" columns={columns} data={data} getRowId={(row) => row.id} />);
    expect(screen.getByRole("table", { name: "Items" })).toBeInTheDocument();
    expect(bodyNames()).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("sorts when a sortable header is clicked and exposes aria-sort", async () => {
    const user = userEvent.setup();
    render(<DataTable caption="Items" columns={columns} data={data} />);
    const header = screen.getByRole("columnheader", { name: /Name/ });
    expect(header).toHaveAttribute("aria-sort", "none");

    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(bodyNames()).toEqual(["Alpha", "Bravo", "Charlie"]);

    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(bodyNames()).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("shows the default empty state", () => {
    render(<DataTable caption="Items" columns={columns} data={[]} />);
    expect(screen.getByRole("heading", { name: "No results" })).toBeInTheDocument();
  });

  it("shows loading skeletons instead of rows", () => {
    const { container } = render(<DataTable caption="Items" columns={columns} data={data} isLoading />);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("shows the error with a retry action", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable caption="Items" columns={columns} data={data} error="Could not load" onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
