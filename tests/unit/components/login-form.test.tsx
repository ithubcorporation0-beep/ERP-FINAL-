import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/features/auth/login-form";
import { loginAction } from "@/server/actions/auth.actions";

vi.mock("@/server/actions/auth.actions", () => ({ loginAction: vi.fn() }));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.mocked(loginAction).mockReset();
  });

  it("shows validation errors and does not call the server when fields are invalid", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(loginAction).not.toHaveBeenCalled();
  });

  it("submits valid credentials and shows the server error", async () => {
    vi.mocked(loginAction).mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Invalid email or password." },
    });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(loginAction).toHaveBeenCalledWith(
      { email: "admin@example.com", password: "wrong-password" },
      null,
    );
  });
});
