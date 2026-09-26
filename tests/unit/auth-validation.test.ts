import { describe, expect, it } from "vitest";
import { changePasswordSchema, passwordSchema, registerSchema } from "@/lib/validation";

describe("password policy", () => {
  it("requires 12 to 128 characters without surrounding spaces", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("correct horse battery").success).toBe(true);
    expect(passwordSchema.safeParse(" padded-password ").success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("rejects mismatched confirmation and reusing the current password", () => {
    const base = {
      currentPassword: "old-password-123",
      password: "new-password-123",
      confirmPassword: "new-password-123",
    };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...base, confirmPassword: "different-123!" }).success).toBe(
      false,
    );
    expect(
      changePasswordSchema.safeParse({
        ...base,
        password: base.currentPassword,
        confirmPassword: base.currentPassword,
      }).success,
    ).toBe(false);
  });

  it("doesn't allow the email address as password and normalizes the email", () => {
    const input = {
      companyName: "Acme",
      name: "Ann Example",
      email: "Ann@Example.test",
      password: "ann@example.test",
      confirmPassword: "ann@example.test",
    };
    expect(registerSchema.safeParse(input).success).toBe(false);
    const ok = registerSchema.parse({
      ...input,
      password: "long-enough-pass",
      confirmPassword: "long-enough-pass",
    });
    expect(ok.email).toBe("ann@example.test");
  });
});
