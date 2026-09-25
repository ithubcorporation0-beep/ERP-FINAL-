import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/shared/status-badge";

describe("StatusBadge", () => {
  it("renders the label with its tone", () => {
    render(<StatusBadge tone="danger">Overdue</StatusBadge>);
    const badge = screen.getByText("Overdue");
    expect(badge).toHaveAttribute("data-tone", "danger");
    expect(badge.className).toContain("text-danger");
  });

  it("defaults to the neutral tone", () => {
    render(<StatusBadge>Draft</StatusBadge>);
    expect(screen.getByText("Draft")).toHaveAttribute("data-tone", "neutral");
  });
});
