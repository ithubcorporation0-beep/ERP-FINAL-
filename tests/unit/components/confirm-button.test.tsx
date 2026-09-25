import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmButton } from "@/components/shared/confirm-button";

function setup() {
  const onConfirm = vi.fn();
  render(
    <ConfirmButton
      label="Delete"
      title="Delete customer?"
      description="This cannot be undone."
      confirmLabel="Yes, delete"
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, user: userEvent.setup() };
}

describe("ConfirmButton", () => {
  it("does not run the action until the user confirms", async () => {
    const { onConfirm, user } = setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog", { name: "Delete customer?" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does nothing when cancelled", async () => {
    const { onConfirm, user } = setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
