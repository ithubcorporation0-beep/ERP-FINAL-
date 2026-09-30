import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@/generated/prisma/client";

/**
 * Tables that hold company data. Every query on them must be scoped by `companyId` — the tenant guard below
 * rejects anything else at runtime, so a forgotten filter fails loudly instead of leaking another company's data.
 * Keep in sync with docs/database.md ("Tenancy").
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  "Role",
  "RolePermission",
  "Membership",
  "Setting",
  "Customer",
  "CustomerDocument",
  "CustomerCommunication",
  "Lead",
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
  "ProductCategory",
  "Warehouse",
  "Product",
  "StockMovement",
  "Supplier",
  "PurchaseRequest",
  "PurchaseRequestItem",
  "PurchaseOrder",
  "PurchaseOrderItem",
  "GoodsReceipt",
  "GoodsReceiptItem",
  "SupplierInvoice",
  "SupplierPayment",
  "Notification",
  "AuditLog",
]);

export class TenantScopeError extends Error {
  constructor(model: string, operation: string, reason: string) {
    super(
      `Unscoped ${model}.${operation}: ${reason}. Scope the query by companyId or wrap it in crossTenant().`,
    );
    this.name = "TenantScopeError";
  }
}

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);
const CREATE_MANY_OPERATIONS = new Set(["createMany", "createManyAndReturn"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `where` filters by company: `companyId`, or a compound unique key that contains it (`companyId_name`, `id_companyId`). */
function whereScopesCompany(where: unknown): boolean {
  if (!isRecord(where)) return false;
  return Object.entries(where).some(
    ([key, value]) => value !== undefined && (key === "companyId" || key.split("_").includes("companyId")),
  );
}

/** Row data names its company, either as `companyId` (null allowed where the column is nullable) or a relation. */
function dataNamesCompany(data: unknown): boolean {
  if (!isRecord(data)) return false;
  return (Object.hasOwn(data, "companyId") && data.companyId !== undefined) || isRecord(data.company);
}

/** Throws TenantScopeError unless a query on a tenant-owned model is scoped to a company. Pure — unit-tested. */
export function assertTenantScoped(model: string, operation: string, args: unknown): void {
  if (!TENANT_MODELS.has(model)) return;
  const input = isRecord(args) ? args : {};

  if (WHERE_OPERATIONS.has(operation)) {
    if (!whereScopesCompany(input.where))
      throw new TenantScopeError(model, operation, "where has no companyId");
    return;
  }
  if (operation === "create") {
    if (!dataNamesCompany(input.data)) throw new TenantScopeError(model, operation, "data has no companyId");
    return;
  }
  if (CREATE_MANY_OPERATIONS.has(operation)) {
    const rows = Array.isArray(input.data) ? input.data : [input.data];
    if (!rows.every(dataNamesCompany)) throw new TenantScopeError(model, operation, "a row has no companyId");
    return;
  }
  if (operation === "upsert") {
    if (!whereScopesCompany(input.where) || !dataNamesCompany(input.create)) {
      throw new TenantScopeError(model, operation, "where or create has no companyId");
    }
    return;
  }
  throw new TenantScopeError(model, operation, "operation is not allowed on tenant-owned models");
}

declare global {
  // One scope per process. The Prisma client is cached on globalThis in development (see ./index.ts), so after a
  // hot reload — or when a bundler loads this module more than once — the cached client's guard and a fresh copy
  // of crossTenant() must still share the same scope, or deliberate cross-company queries get rejected.
  var __erpCrossTenantScope: AsyncLocalStorage<string> | undefined;
}

const crossTenantScope = (globalThis.__erpCrossTenantScope ??= new AsyncLocalStorage<string>());

/**
 * Runs deliberately cross-company queries — e.g. "which companies does this user belong to?" — past the tenant
 * guard. Always give a reason; every use should be reviewable with `grep crossTenant(`.
 */
export function crossTenant<T>(reason: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!reason.trim()) throw new Error("crossTenant() needs a reason");
  // Await inside the scope: Prisma queries are lazy and only run when awaited, so returning the unawaited
  // promise would execute the query outside the scope (and the guard would, correctly, reject it).
  return crossTenantScope.run(reason, async () => await fn());
}

export function isCrossTenant(): boolean {
  return crossTenantScope.getStore() !== undefined;
}

/** Prisma client extension that applies `assertTenantScoped` to every model query. */
export const tenantGuard = Prisma.defineExtension({
  name: "tenant-guard",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!isCrossTenant()) assertTenantScoped(model, operation, args);
        return query(args);
      },
    },
  },
});
