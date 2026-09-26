/** Test-only accounts created in the e2e database by tests/e2e/fixtures/create-users.ts. */
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "e2e-only-password-123";

export const E2E_USERS = {
  employee: { email: "e2e-employee@example.test", name: "Erin Employee", role: "Employee" },
  accountant: { email: "e2e-accountant@example.test", name: "Alex Accountant", role: "Accountant" },
} as const;
