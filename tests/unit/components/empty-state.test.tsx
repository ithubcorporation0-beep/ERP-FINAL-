import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/shared/empty-state";

describe("EmptyState", () => {
  it("renders the title, description and action", () => {
    render(
      <EmptyState
        title="No customers yet"
        description="Add your first customer."
        action={<button>Add</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "No customers yet" })).toBeInTheDocument();
    expect(screen.getByText("Add your first customer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});
