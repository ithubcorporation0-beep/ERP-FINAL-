/** Test-only accounts created in the e2e database by tests/e2e/fixtures/create-users.ts. */
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "e2e-only-password-123";

/** Members of the seeded company ("company A"). */
export const E2E_USERS = {
  employee: { email: "e2e-employee@example.test", name: "Erin Employee", role: "Employee" },
  accountant: { email: "e2e-accountant@example.test", name: "Alex Accountant", role: "Accountant" },
  admin: { email: "e2e-admin@example.test", name: "Ada Admin", role: "Admin" },
} as const;

/** A second, separate company ("company B") with its own Super Admin. */
export const E2E_OTHER_COMPANY = {
  name: "E2E Other Company",
  slug: "e2e-other-company",
  owner: { email: "e2e-other-owner@example.test", name: "Olga Other" },
} as const;

/** Belongs to both companies: Employee in company A (default), Accountant in company B. */
export const E2E_MULTI_USER = { email: "e2e-multi@example.test", name: "Morgan Multi" } as const;
