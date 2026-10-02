/**
 * Human-readable audit actions. Actions are dotted verbs ("invoice.payment_recorded", "auth.login"); the module
 * prefix becomes a group for filtering and the rest a readable verb.
 */

const GROUP_LABELS: Record<string, string> = {
  auth: "Sign-in and account security",
  user: "Users",
  role: "Roles",
  permission: "Permissions",
  company: "Company",
  setting: "Settings",
  audit_log: "Audit log",
  notification: "Notifications",
  customer: "Customers",
  lead: "Leads",
  quotation: "Quotations",
  invoice: "Invoices",
  payment: "Payments",
  expense: "Expenses",
  account: "Chart of accounts",
  journal: "Transactions",
  department: "Departments",
  employee: "Employees",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  project: "Projects",
  task: "Tasks",
  product: "Products",
  product_category: "Product categories",
  warehouse: "Warehouses",
  stock: "Stock",
  supplier: "Suppliers",
  purchase_request: "Purchase requests",
  purchase_order: "Purchase orders",
  supplier_invoice: "Supplier invoices",
};

export function actionGroup(action: string): string {
  return action.split(".")[0] ?? action;
}

export function actionGroupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

/** "invoice.payment_recorded" → "Payment recorded"; "auth.login" → "Login". */
export function actionVerbLabel(action: string): string {
  const verb = action.split(".").slice(1).join(" ") || action;
  return verb.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

/** Values are quoted when needed so the CSV opens correctly in Excel and Google Sheets; formulas are defused. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // A leading = + - @ would be run as a formula by spreadsheet apps (CSV injection).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
