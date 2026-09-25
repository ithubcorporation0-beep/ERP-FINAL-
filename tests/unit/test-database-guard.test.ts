import { describe, expect, it } from "vitest";
import { assertTestDatabase } from "../setup/integration-global";

describe("integration test database guard", () => {
  it("accepts only databases whose name contains 'test'", () => {
    expect(assertTestDatabase("postgresql://u:p@localhost:5432/erp_test")).toContain("erp_test");
    expect(() => assertTestDatabase("postgresql://u:p@localhost:5432/it_hub_erp")).toThrow(
      /must contain "test"/,
    );
    expect(() => assertTestDatabase(undefined)).toThrow(/not set/);
  });
});
