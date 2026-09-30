import { describe, expect, it, vi } from "vitest";
import { TENANT_MODELS, TenantScopeError, assertTenantScoped } from "@/lib/db/tenant-guard";

const COMPANY = "0192a1f0-0000-7000-8000-000000000001";

describe("tenant guard (assertTenantScoped)", () => {
  it("covers every company-owned table", () => {
    expect([...TENANT_MODELS].sort()).toEqual(
      [
        "AuditLog",
        "Customer",
        "CustomerCommunication",
        "CustomerDocument",
        "Lead",
        "Membership",
        "Notification",
        "NumberSequence",
        "Quotation",
        "QuotationItem",
        "Invoice",
        "InvoiceItem",
        "Payment",
        "ShareLink",
        "Account",
        "JournalEntry",
        "JournalLine",
        "Expense",
        "Department",
        "Employee",
        "EmployeeCompensation",
        "EmployeeDocument",
        "AttendanceRecord",
        "LeaveRequest",
        "SalaryComponent",
        "SalaryAdvance",
        "PayrollRun",
        "PayrollItem",
        "Project",
        "Task",
        "TaskAttachment",
        "Role",
        "RolePermission",
        "Setting",
      ].sort(),
    );
  });

  it("rejects reads, updates and deletes without a company filter", () => {
    for (const operation of [
      "findMany",
      "findFirst",
      "findUnique",
      "count",
      "update",
      "updateMany",
      "delete",
      "deleteMany",
    ]) {
      expect(() => assertTenantScoped("Customer", operation, { where: { id: "x" } }), operation).toThrow(
        TenantScopeError,
      );
      expect(() => assertTenantScoped("Customer", operation, {}), operation).toThrow(TenantScopeError);
    }
  });

  it("rejects a companyId that is present but undefined (e.g. a missing variable)", () => {
    expect(() => assertTenantScoped("Customer", "findMany", { where: { companyId: undefined } })).toThrow(
      TenantScopeError,
    );
  });

  it("accepts companyId and compound unique keys that contain it", () => {
    expect(() => assertTenantScoped("Customer", "findMany", { where: { companyId: COMPANY } })).not.toThrow();
    expect(() =>
      assertTenantScoped("Role", "findUnique", {
        where: { companyId_name: { companyId: COMPANY, name: "Admin" } },
      }),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped("Membership", "upsert", {
        where: { companyId_userId: { companyId: COMPANY, userId: "u" } },
        create: { companyId: COMPANY, userId: "u", roleId: "r" },
        update: {},
      }),
    ).not.toThrow();
  });

  it("requires company data on inserts, for every row", () => {
    expect(() => assertTenantScoped("Customer", "create", { data: { name: "A" } })).toThrow(TenantScopeError);
    expect(() =>
      assertTenantScoped("Customer", "create", { data: { name: "A", companyId: COMPANY } }),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped("RolePermission", "createMany", { data: [{ companyId: COMPANY }, { roleId: "r" }] }),
    ).toThrow(TenantScopeError);
    // Account-level audit events explicitly have no company (null), which is allowed.
    expect(() =>
      assertTenantScoped("AuditLog", "create", { data: { companyId: null, action: "auth.login" } }),
    ).not.toThrow();
  });

  it("ignores tables that are not company-owned", () => {
    expect(() => assertTenantScoped("User", "findMany", {})).not.toThrow();
    expect(() => assertTenantScoped("Permission", "deleteMany", {})).not.toThrow();
  });
});

describe("crossTenant scope", () => {
  it("is shared by every copy of the module (dev hot reload / duplicate bundling)", async () => {
    const first = await import("@/lib/db/tenant-guard");
    vi.resetModules();
    const second = await import("@/lib/db/tenant-guard");
    expect(second).not.toBe(first);
    // A client created with the first copy's guard must see a scope opened by the second copy.
    await second.crossTenant("test", async () => {
      expect(first.isCrossTenant()).toBe(true);
    });
    expect(first.isCrossTenant()).toBe(false);
  });
});
