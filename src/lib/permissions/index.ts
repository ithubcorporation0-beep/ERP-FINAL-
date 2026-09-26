/**
 * Permission constants and checks. This file is the single source of truth: `npm run db:seed` syncs
 * PERMISSION_KEYS into the `permissions` table, and roles link to them through `role_permissions`.
 * See docs/permissions.md.
 */

/** Every permission that exists, as `module:action`. Add new ones here (and document them). */
export const PERMISSION_KEYS = [
  "dashboard:view",

  "customers:view",
  "customers:create",
  "customers:edit",
  "customers:delete",
  "customers:export",

  "leads:view",
  "leads:create",
  "leads:edit",
  "leads:delete",
  "leads:export",

  "invoices:view",
  "invoices:create",
  "invoices:edit",
  "invoices:delete",
  "invoices:export",

  "payments:view",
  "payments:create",
  "payments:edit",
  "payments:delete",
  "payments:export",

  "expenses:view",
  "expenses:create",
  "expenses:edit",
  "expenses:delete",
  "expenses:export",
  "expenses:approve",
  "expenses:reject",

  "employees:view",
  "employees:create",
  "employees:edit",
  "employees:delete",
  "employees:export",

  "attendance:view",
  "attendance:create",
  "attendance:edit",
  "attendance:delete",
  "attendance:export",
  "attendance:approve",
  "attendance:reject",

  "leaves:view",
  "leaves:create",
  "leaves:edit",
  "leaves:delete",
  "leaves:export",
  "leaves:approve",
  "leaves:reject",

  "payroll:view",
  "payroll:create",
  "payroll:edit",
  "payroll:delete",
  "payroll:export",
  "payroll:approve",
  "payroll:reject",

  "projects:view",
  "projects:create",
  "projects:edit",
  "projects:delete",
  "projects:export",

  "tasks:view",
  "tasks:create",
  "tasks:edit",
  "tasks:delete",
  "tasks:export",

  "products:view",
  "products:create",
  "products:edit",
  "products:delete",
  "products:export",

  "suppliers:view",
  "suppliers:create",
  "suppliers:edit",
  "suppliers:delete",
  "suppliers:export",

  "purchases:view",
  "purchases:create",
  "purchases:edit",
  "purchases:delete",
  "purchases:export",
  "purchases:approve",
  "purchases:reject",

  "inventory:view",
  "inventory:create",
  "inventory:edit",
  "inventory:delete",
  "inventory:export",

  "accounting:view",
  "accounting:create",
  "accounting:edit",
  "accounting:delete",
  "accounting:export",

  "reports:view",
  "reports:export",

  "audit-logs:view",
  "audit-logs:export",

  "users:view",
  "users:manage",

  "roles:view",
  "roles:manage",

  "settings:view",
  "settings:manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type Module = PermissionKey extends `${infer M}:${string}` ? M : never;
export type Action = PermissionKey extends `${string}:${infer A}` ? A : never;
/** A permission or a wildcard, used only to *define* roles in code: "invoices:*" or "*". */
export type PermissionPattern = PermissionKey | `${Module}:*` | "*";

export const ACTION_LABELS: Record<Action, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
  approve: "Approve",
  reject: "Reject",
  manage: "Manage",
};

export const MODULE_LABELS: Record<Module, string> = {
  dashboard: "Dashboard",
  customers: "Customers",
  leads: "Leads",
  invoices: "Invoices",
  payments: "Payments",
  expenses: "Expenses",
  employees: "Employees",
  attendance: "Attendance",
  leaves: "Leave",
  payroll: "Payroll",
  projects: "Projects",
  tasks: "Tasks",
  products: "Products",
  suppliers: "Suppliers",
  purchases: "Purchases",
  inventory: "Inventory",
  accounting: "Accounting",
  reports: "Reports",
  "audit-logs": "Audit logs",
  users: "Users",
  roles: "Roles",
  settings: "Settings",
};

export interface PermissionDefinition {
  key: PermissionKey;
  module: Module;
  action: Action;
  description: string;
}

function isModule(value: string): value is Module {
  return Object.hasOwn(MODULE_LABELS, value);
}

function isAction(value: string): value is Action {
  return Object.hasOwn(ACTION_LABELS, value);
}

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEYS.some((key) => key === value);
}

function definition(key: PermissionKey): PermissionDefinition {
  const [module = "", action = ""] = key.split(":");
  if (!isModule(module) || !isAction(action)) throw new Error(`Malformed permission key ${key}`);
  return {
    key,
    module,
    action,
    description: `${ACTION_LABELS[action]} ${MODULE_LABELS[module].toLowerCase()}`,
  };
}

/** Catalogue with module/action/description per key. Synced to the `permissions` table. */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = PERMISSION_KEYS.map(definition);

/** Modules in display order, each with the actions that exist for it (for the role editor). */
export const PERMISSION_GROUPS: ReadonlyArray<{
  module: Module;
  label: string;
  permissions: PermissionDefinition[];
}> = PERMISSION_CATALOG.reduce<Array<{ module: Module; label: string; permissions: PermissionDefinition[] }>>(
  (groups, permission) => {
    const last = groups.at(-1);
    if (last?.module === permission.module) last.permissions.push(permission);
    else
      groups.push({
        module: permission.module,
        label: MODULE_LABELS[permission.module],
        permissions: [permission],
      });
    return groups;
  },
  [],
);

/** True when `granted` covers `required`. Supports `*` and `module:*` wildcards. */
export function hasPermission(granted: readonly string[], required: PermissionKey): boolean {
  const [module] = required.split(":");
  return granted.includes("*") || granted.includes(`${module}:*`) || granted.includes(required);
}

export function hasAnyPermission(granted: readonly string[], required: readonly PermissionKey[]): boolean {
  return required.some((permission) => hasPermission(granted, permission));
}

/** Expands wildcard patterns into the concrete catalogue keys they cover. */
export function expandPermissions(patterns: readonly PermissionPattern[]): PermissionKey[] {
  return PERMISSION_KEYS.filter((key) => hasPermission(patterns, key));
}

export interface DefaultRole {
  description: string;
  permissions: PermissionPattern[];
}

export const SUPER_ADMIN_ROLE = "Super Admin";

/**
 * Built-in roles created for every company (`is_system = true`, not editable in the UI).
 * Record-level rules such as "employees only see their own leave requests" belong to each module.
 */
export const DEFAULT_ROLES: Record<string, DefaultRole> = {
  [SUPER_ADMIN_ROLE]: {
    description: "Full access to everything, including company settings, users and roles.",
    permissions: ["*"],
  },
  Admin: {
    description: "Runs day-to-day administration: all modules and users, but not roles or company settings.",
    permissions: PERMISSION_KEYS.filter((key) => key !== "roles:manage" && key !== "settings:manage"),
  },
  Manager: {
    description: "Leads a team: sales, projects and approvals, with reports.",
    permissions: [
      "dashboard:view",
      "customers:*",
      "leads:*",
      "invoices:view",
      "invoices:create",
      "invoices:edit",
      "invoices:export",
      "projects:*",
      "tasks:*",
      "employees:view",
      "attendance:view",
      "attendance:approve",
      "attendance:reject",
      "leaves:view",
      "leaves:approve",
      "leaves:reject",
      "expenses:view",
      "expenses:approve",
      "expenses:reject",
      "purchases:view",
      "purchases:approve",
      "purchases:reject",
      "products:view",
      "inventory:view",
      "reports:view",
      "reports:export",
      "users:view",
    ],
  },
  Accountant: {
    description: "Invoices, payments, expenses and accounting.",
    permissions: [
      "dashboard:view",
      "invoices:*",
      "payments:*",
      "expenses:*",
      "accounting:*",
      "customers:view",
      "suppliers:view",
      "purchases:view",
      "payroll:view",
      "reports:view",
      "reports:export",
    ],
  },
  "HR Manager": {
    description: "Employees, attendance, leave and payroll.",
    permissions: [
      "dashboard:view",
      "employees:*",
      "attendance:*",
      "leaves:*",
      "payroll:*",
      "reports:view",
      "reports:export",
      "users:view",
    ],
  },
  Employee: {
    description: "Own attendance, leave and expense requests; assigned projects and tasks.",
    permissions: [
      "dashboard:view",
      "attendance:view",
      "attendance:create",
      "leaves:view",
      "leaves:create",
      "expenses:view",
      "expenses:create",
      "projects:view",
      "tasks:view",
      "tasks:edit",
    ],
  },
  Customer: {
    description: "External customer. No access to internal modules; the customer portal arrives in phase 15.",
    permissions: [],
  },
};
