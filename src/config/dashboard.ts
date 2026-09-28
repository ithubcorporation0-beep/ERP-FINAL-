import type { PermissionKey } from "@/lib/permissions";
import { MODULE_RELEASES, type ModuleKey } from "./modules";

/**
 * What the dashboard can show, and who may see it. Plain data (no React) so the server decides visibility and the
 * UI maps ids to icons (src/features/dashboard/icons.ts).
 *
 * A widget is shown when the user has ANY of its `permissions` (checked on the server). Its data comes from a
 * provider in src/server/services/dashboard.service.ts; a widget without a provider reports "not tracked yet"
 * instead of inventing numbers. When a module ships, its phase adds the provider and quick-action `href`.
 */

/** Modules the dashboard reads from, with the phase that delivers them (shown to users while unavailable). */
export const DASHBOARD_SOURCES = MODULE_RELEASES;
export type DashboardSource = ModuleKey;

interface WidgetDefinition<Id extends string> {
  id: Id;
  label: string;
  description?: string;
  source: DashboardSource;
  /** Any one of these grants the widget. Company-wide money figures need finance-level access, not "own" access. */
  permissions: readonly PermissionKey[];
}

export const KPI_IDS = [
  "totalRevenue",
  "totalExpenses",
  "netProfit",
  "outstandingInvoices",
  "totalCustomers",
  "totalEmployees",
  "activeProjects",
  "pendingTasks",
  "lowStockItems",
] as const;
export type KpiId = (typeof KPI_IDS)[number];

export const KPI_WIDGETS: readonly WidgetDefinition<KpiId>[] = [
  {
    id: "totalRevenue",
    label: "Total revenue",
    source: "sales",
    permissions: ["invoices:view", "accounting:view"],
  },
  {
    id: "totalExpenses",
    label: "Total expenses",
    source: "finance",
    permissions: ["accounting:view", "expenses:approve"],
  },
  { id: "netProfit", label: "Net profit", source: "finance", permissions: ["accounting:view"] },
  {
    id: "outstandingInvoices",
    label: "Outstanding invoices",
    source: "sales",
    permissions: ["invoices:view"],
  },
  { id: "totalCustomers", label: "Total customers", source: "customers", permissions: ["customers:view"] },
  { id: "totalEmployees", label: "Total employees", source: "hr", permissions: ["employees:view"] },
  { id: "activeProjects", label: "Active projects", source: "projects", permissions: ["projects:view"] },
  { id: "pendingTasks", label: "Pending tasks", source: "projects", permissions: ["tasks:view"] },
  { id: "lowStockItems", label: "Low stock items", source: "inventory", permissions: ["inventory:view"] },
];

export const CHART_IDS = [
  "revenueVsExpenses",
  "monthlySales",
  "expenseBreakdown",
  "customerGrowth",
  "projectStatus",
  "employeeAttendance",
] as const;
export type ChartId = (typeof CHART_IDS)[number];

export const CHART_WIDGETS: readonly WidgetDefinition<ChartId>[] = [
  {
    id: "revenueVsExpenses",
    label: "Revenue vs expenses",
    description: "Money in and out per month.",
    source: "finance",
    permissions: ["accounting:view"],
  },
  {
    id: "monthlySales",
    label: "Monthly sales",
    description: "Invoiced sales per month.",
    source: "sales",
    permissions: ["invoices:view"],
  },
  {
    id: "expenseBreakdown",
    label: "Expense breakdown",
    description: "Expenses by category.",
    source: "finance",
    permissions: ["accounting:view", "expenses:approve"],
  },
  {
    id: "customerGrowth",
    label: "Customer growth",
    description: "New customers per month and the running total.",
    source: "customers",
    permissions: ["customers:view"],
  },
  {
    id: "projectStatus",
    label: "Project status",
    description: "Projects by status.",
    source: "projects",
    permissions: ["projects:view"],
  },
  {
    id: "employeeAttendance",
    label: "Employee attendance",
    description: "Present, late and absent per month.",
    source: "hr",
    permissions: ["employees:view"],
  },
];

export const ACTIVITY_IDS = [
  "newCustomers",
  "newInvoices",
  "payments",
  "expenses",
  "employeeActivity",
  "projectUpdates",
] as const;
export type ActivityId = (typeof ACTIVITY_IDS)[number];

export const ACTIVITY_SOURCES: readonly WidgetDefinition<ActivityId>[] = [
  { id: "newCustomers", label: "New customers", source: "customers", permissions: ["customers:view"] },
  { id: "newInvoices", label: "New invoices", source: "sales", permissions: ["invoices:view"] },
  { id: "payments", label: "Payments", source: "sales", permissions: ["payments:view"] },
  {
    id: "expenses",
    label: "Expenses",
    source: "finance",
    permissions: ["accounting:view", "expenses:approve"],
  },
  { id: "employeeActivity", label: "Employee activity", source: "hr", permissions: ["employees:view"] },
  { id: "projectUpdates", label: "Project updates", source: "projects", permissions: ["projects:view"] },
];

export const QUICK_ACTION_IDS = [
  "addCustomer",
  "createInvoice",
  "addExpense",
  "addEmployee",
  "createProject",
  "addProduct",
  "recordPayment",
] as const;
export type QuickActionId = (typeof QUICK_ACTION_IDS)[number];

interface QuickActionDefinition {
  id: QuickActionId;
  label: string;
  source: DashboardSource;
  permission: PermissionKey;
  /** Page with the create form. Unset until the module's screen exists — the action then shows as "coming". */
  href?: string;
}

export const QUICK_ACTIONS: readonly QuickActionDefinition[] = [
  {
    id: "addCustomer",
    label: "Add customer",
    source: "customers",
    permission: "customers:create",
    href: "/crm/customers/new",
  },
  {
    id: "createInvoice",
    label: "Create invoice",
    source: "sales",
    permission: "invoices:create",
    href: "/sales/invoices/new",
  },
  {
    id: "addExpense",
    label: "Add expense",
    source: "finance",
    permission: "expenses:create",
    href: "/finance/expenses/new",
  },
  { id: "addEmployee", label: "Add employee", source: "hr", permission: "employees:create" },
  { id: "createProject", label: "Create project", source: "projects", permission: "projects:create" },
  { id: "addProduct", label: "Add product", source: "inventory", permission: "products:create" },
  {
    id: "recordPayment",
    label: "Record payment",
    source: "sales",
    permission: "payments:create",
    href: "/sales/payments/new",
  },
];
