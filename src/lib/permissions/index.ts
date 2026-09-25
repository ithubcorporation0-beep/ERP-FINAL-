export const MODULES = [
  "customers",
  "leads",
  "invoices",
  "payments",
  "expenses",
  "employees",
  "attendance",
  "leaves",
  "payroll",
  "projects",
  "tasks",
  "products",
  "suppliers",
  "purchases",
  "inventory",
  "accounting",
  "reports",
  "audit-logs",
  "settings",
] as const;

export const ACTIONS = ["read", "create", "update", "delete", "approve"] as const;

export type Module = (typeof MODULES)[number];
export type Action = (typeof ACTIONS)[number];
export type Permission = `${Module}:${Action}` | `${Module}:*` | "*";

/** Returns true when `granted` covers `required`, honouring `*` and `module:*` wildcards. */
export function hasPermission(granted: readonly string[], required: `${Module}:${Action}`): boolean {
  const [module] = required.split(":");
  return granted.includes("*") || granted.includes(`${module}:*`) || granted.includes(required);
}

export const DEFAULT_ROLES: Record<string, Permission[]> = {
  Owner: ["*"],
  Admin: MODULES.filter((m) => m !== "settings").map((m) => `${m}:*` as Permission),
  Accountant: ["invoices:*", "payments:*", "expenses:*", "accounting:*", "reports:read", "customers:read"],
  "HR Manager": ["employees:*", "attendance:*", "leaves:*", "payroll:*", "reports:read"],
  "Sales Rep": ["customers:*", "leads:*", "invoices:read", "invoices:create", "products:read"],
  Employee: ["attendance:create", "leaves:create", "tasks:read", "tasks:update", "projects:read"],
};
