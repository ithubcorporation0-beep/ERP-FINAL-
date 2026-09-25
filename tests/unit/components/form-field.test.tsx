import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";

const schema = z.object({ name: z.string().min(2, "Name is too short.") });

function TestForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });
  return (
    <form onSubmit={form.handleSubmit(() => undefined)}>
      <FormField
        control={form.control}
        name="name"
        label="Company name"
        description="As registered."
        render={({ field, control }) => <Input {...field} {...control} />}
      />
      <button type="submit">Save</button>
    </form>
  );
}

describe("FormField", () => {
  it("links the label and description to the input", () => {
    render(<TestForm />);
    const input = screen.getByLabelText("Company name");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).toHaveAccessibleDescription("As registered.");
  });

  it("marks the input invalid and announces the error", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.click(screen.getByRole("button", { name: "Save" }));

    const input = screen.getByLabelText("Company name");
    expect(await screen.findByText("Name is too short.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Name is too short\./);
  });
});
