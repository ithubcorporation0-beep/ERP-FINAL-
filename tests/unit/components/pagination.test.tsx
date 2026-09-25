import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination, pageRange } from "@/components/tables/pagination";

describe("pageRange", () => {
  it("computes the visible record range", () => {
    expect(pageRange(2, 10, 45)).toEqual({ pageCount: 5, current: 2, from: 11, to: 20 });
    expect(pageRange(5, 10, 45)).toEqual({ pageCount: 5, current: 5, from: 41, to: 45 });
  });

  it("clamps out-of-range pages and handles empty results", () => {
    expect(pageRange(99, 10, 45).current).toBe(5);
    expect(pageRange(1, 10, 0)).toEqual({ pageCount: 1, current: 1, from: 0, to: 0 });
  });
});

describe("Pagination", () => {
  it("shows the range and moves between pages", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} pageSize={10} total={45} onPageChange={onPageChange} />);

    expect(screen.getByText("Showing 11–20 of 45")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables buttons at the edges", () => {
    render(<Pagination page={1} pageSize={10} total={5} onPageChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});
