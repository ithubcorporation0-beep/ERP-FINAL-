import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "@/components/shared/search-input";

describe("SearchInput", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls onSearch once, after the user stops typing", () => {
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} delay={300} label="Search customers" />);
    const input = screen.getByLabelText("Search customers");

    fireEvent.change(input, { target: { value: "ac" } });
    fireEvent.change(input, { target: { value: "acme " } });
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("acme");
  });

  it("does not search on mount and clears with the clear button", () => {
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} defaultValue="old" />);
    act(() => vi.advanceTimersByTime(500));
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    act(() => vi.advanceTimersByTime(300));
    expect(onSearch).toHaveBeenCalledWith("");
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
});
