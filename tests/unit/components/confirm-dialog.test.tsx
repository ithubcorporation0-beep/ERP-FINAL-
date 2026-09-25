import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

function renderDialog(onConfirm: () => Promise<void>) {
  render(
    <ConfirmDialog
      title="Void invoice?"
      description="This cannot be undone."
      confirmLabel="Void"
      onConfirm={onConfirm}
      trigger={<Button>Void</Button>}
    />,
  );
  return userEvent.setup();
}

describe("ConfirmDialog", () => {
  it("stays open while the action runs, then closes", async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const user = renderDialog(onConfirm);

    await user.click(screen.getByRole("button", { name: "Void" }));
    const dialog = screen.getByRole("alertdialog", { name: "Void invoice?" });
    await user.click(screen.getByRole("button", { name: "Void" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    finish();
    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open and shows the error when the action fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = renderDialog(() => Promise.reject(new Error("Invoice is already paid")));

    await user.click(screen.getByRole("button", { name: "Void" }));
    await user.click(screen.getByRole("button", { name: "Void" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invoice is already paid");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
