/**
 * Permission model. The code below is the source of truth; `npm run db:seed` syncs the catalogue
 * into the `permissions` table, and roles link to it through `role_permissions`.
 */

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
  "users",
  "roles",
  "settings",
] as const;

export const ACTIONS = ["read", "create", "update", "delete", "approve"] as const;

export type Module = (typeof MODULES)[number];
export type Action = (typeof ACTIONS)[number];
/** A concrete permission stored in the database, e.g. "invoices:create". */
export type PermissionKey = `${Module}:${Action}`;
/** A permission or a wildcard, used only to *define* roles in code: "invoices:*" or "*". */
export type PermissionPattern = PermissionKey | `${Module}:*` | "*";

export interface PermissionDefinition {
  key: PermissionKey;
  module: Module;
  action: Action;
  description: string;
}

const ACTION_VERBS: Record<Action, string> = {
  read: "View",
  create: "Create",
  update: "Edit",
  delete: "Delete",
  approve: "Approve",
};

/** Every permission that exists. Synced to the `permissions` table by the seed. */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = MODULES.flatMap((module) =>
  ACTIONS.map((action) => {
    const key: PermissionKey = `${module}:${action}`;
    return { key, module, action, description: `${ACTION_VERBS[action]} ${module.replace("-", " ")}` };
  }),
);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_CATALOG.some((permission) => permission.key === value);
}

/** Expands wildcard patterns into the concrete catalogue keys they cover. */
export function expandPermissions(patterns: readonly PermissionPattern[]): PermissionKey[] {
  return PERMISSION_CATALOG.filter((permission) => hasPermission(patterns, permission.key)).map(
    (permission) => permission.key,
  );
}

/** True when `granted` covers `required`. Supports `*` and `module:*` wildcards. */
export function hasPermission(granted: readonly string[], required: PermissionKey): boolean {
  const [module] = required.split(":");
  return granted.includes("*") || granted.includes(`${module}:*`) || granted.includes(required);
}

export interface DefaultRole {
  description: string;
  permissions: PermissionPattern[];
}

/** Built-in roles created for every new company (as `is_system` roles). */
export const DEFAULT_ROLES: Record<string, DefaultRole> = {
  Owner: { description: "Full access to everything, including company settings.", permissions: ["*"] },
  Admin: {
    description: "Full access to all modules except company settings.",
    permissions: MODULES.filter((module) => module !== "settings").map(
      (module): PermissionPattern => `${module}:*`,
    ),
  },
  Accountant: {
    description: "Invoices, payments, expenses and accounting.",
    permissions: ["invoices:*", "payments:*", "expenses:*", "accounting:*", "reports:read", "customers:read"],
  },
  "HR Manager": {
    description: "Employees, attendance, leave and payroll.",
    permissions: ["employees:*", "attendance:*", "leaves:*", "payroll:*", "reports:read"],
  },
  "Sales Rep": {
    description: "Customers, leads and creating invoices.",
    permissions: ["customers:*", "leads:*", "invoices:read", "invoices:create", "products:read"],
  },
  Employee: {
    description: "Own attendance and leave requests; assigned projects and tasks.",
    permissions: ["attendance:create", "leaves:create", "tasks:read", "tasks:update", "projects:read"],
  },
};

export const OWNER_ROLE = "Owner";
