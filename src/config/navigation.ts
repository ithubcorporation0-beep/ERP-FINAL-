import { hasPermission, type PermissionKey } from "@/lib/permissions";

export type NavIconName =
  | "dashboard"
  | "customers"
  | "leads"
  | "quotations"
  | "orders"
  | "payments"
  | "expenses"
  | "accounts"
  | "transactions"
  | "statements"
  | "sales"
  | "finance"
  | "hr"
  | "employees"
  | "departments"
  | "attendance"
  | "leave"
  | "payroll"
  | "advances"
  | "projects"
  | "tasks"
  | "board"
  | "inventory"
  | "movements"
  | "warehouses"
  | "categories"
  | "suppliers"
  | "requests"
  | "purchaseOrders"
  | "bills"
  | "supplierPayments"
  | "reports"
  | "users"
  | "roles"
  | "audit"
  | "settings"
  | "notifications";

export interface NavItem {
  label: string;
  href: string;
  /** Icon name; mapped to an icon component in src/components/layout/nav-icons.ts (keeps this file UI-free). */
  icon: NavIconName;
  /** One-line summary, shown on the module's page and in global search. */
  description: string;
  /**
   * Permission needed to open the page. The page itself enforces it on the server; the menu only hides
   * links the user can't open. Omit for pages every signed-in user may see.
   */
  permission?: PermissionKey;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Single source of truth for the sidebar, mobile menu, breadcrumbs, global search and post-login landing.
 * Plain data (no React imports) so server code can use it too.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "dashboard",
        permission: "dashboard:view",
        description: "Key figures and activity across your company.",
      },
    ],
  },
  {
    title: "Sales & CRM",
    items: [
      {
        label: "Customers",
        href: "/crm/customers",
        icon: "customers",
        permission: "customers:view",
        description: "Customer records, communication, documents and history.",
      },
      {
        label: "Leads",
        href: "/crm/leads",
        icon: "leads",
        permission: "leads:view",
        description: "Potential customers and the sales pipeline.",
      },
      {
        label: "Quotations",
        href: "/sales/quotations",
        icon: "quotations",
        permission: "quotations:view",
        description: "Price offers for customers, sent by email or WhatsApp.",
      },
      {
        label: "Sales orders",
        href: "/sales/orders",
        icon: "orders",
        permission: "quotations:view",
        description: "Quotations the customer has confirmed, ready to invoice.",
      },
      {
        label: "Invoices",
        href: "/sales/invoices",
        icon: "sales",
        permission: "invoices:view",
        description: "Customer invoices, balances and due dates.",
      },
      {
        label: "Payments",
        href: "/sales/payments",
        icon: "payments",
        permission: "payments:view",
        description: "Money received against invoices.",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        label: "Expenses",
        href: "/finance/expenses",
        icon: "expenses",
        permission: "expenses:view",
        description: "Submit expenses with receipts; approvers approve or reject them.",
      },
      {
        label: "Accounts",
        href: "/finance/accounts",
        icon: "accounts",
        permission: "accounting:view",
        description: "Chart of accounts with balances and transaction history.",
      },
      {
        label: "Transactions",
        href: "/finance/transactions",
        icon: "transactions",
        permission: "accounting:view",
        description: "Every posting in the ledger, automatic and manual.",
      },
      {
        label: "Financial reports",
        href: "/finance/reports",
        icon: "statements",
        permission: "accounting:view",
        description: "Profit & loss, balance sheet, cash flow, receivables, payables, expenses and revenue.",
      },
    ],
  },
  {
    title: "People",
    items: [
      {
        label: "Employees",
        href: "/hr/employees",
        icon: "employees",
        permission: "employees:view",
        description: "Employee profiles, documents and employment status.",
      },
      {
        label: "Departments",
        href: "/hr/departments",
        icon: "departments",
        permission: "employees:view",
        description: "Departments employees belong to.",
      },
      {
        label: "Attendance",
        href: "/hr/attendance",
        icon: "attendance",
        permission: "attendance:view",
        description: "Check in and out, today's attendance, history and reports.",
      },
      {
        label: "Leave",
        href: "/hr/leave",
        icon: "leave",
        permission: "leaves:view",
        description: "Leave requests and approvals.",
      },
      {
        label: "Payroll runs",
        href: "/payroll/runs",
        icon: "payroll",
        permission: "payroll:view",
        description: "Monthly payroll: process, approve, pay and download salary slips.",
      },
      {
        label: "Salary advances",
        href: "/payroll/advances",
        icon: "advances",
        permission: "payroll:view",
        description: "Advances paid to employees, recovered by the next payroll.",
      },
      {
        label: "Payroll reports",
        href: "/payroll/reports",
        icon: "statements",
        permission: "payroll:view",
        description: "Payroll cost by month, department and employee.",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Projects",
        href: "/projects",
        icon: "projects",
        permission: "projects:view",
        description: "Projects with customer, manager, budget, deadlines and progress.",
      },
      {
        label: "Tasks",
        href: "/projects/tasks",
        icon: "tasks",
        permission: "tasks:view",
        description: "Tasks with assignees, priorities, deadlines and attachments.",
      },
      {
        label: "Task board",
        href: "/projects/board",
        icon: "board",
        permission: "tasks:view",
        description: "Kanban board: move tasks between To do, In progress, Review and Completed.",
      },
      {
        label: "Project reports",
        href: "/projects/reports",
        icon: "statements",
        permission: "projects:view",
        description: "Progress, deadlines and open work per person across projects.",
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        label: "Products & stock",
        href: "/inventory",
        icon: "inventory",
        permission: "products:view",
        description: "Products with SKU, prices, current stock and low-stock alerts.",
      },
      {
        label: "Stock movements",
        href: "/inventory/movements",
        icon: "movements",
        permission: "inventory:view",
        description: "Inventory history: stock in, stock out, adjustments, transfers and goods received.",
      },
      {
        label: "Warehouses",
        href: "/inventory/warehouses",
        icon: "warehouses",
        permission: "inventory:view",
        description: "Where stock is kept.",
      },
      {
        label: "Categories",
        href: "/inventory/categories",
        icon: "categories",
        permission: "products:view",
        description: "Product categories.",
      },
      {
        label: "Inventory reports",
        href: "/inventory/reports",
        icon: "statements",
        permission: "products:view",
        description: "Stock value at purchase price and products below their minimum stock.",
      },
    ],
  },
  {
    title: "Purchasing",
    items: [
      {
        label: "Suppliers",
        href: "/purchasing/suppliers",
        icon: "suppliers",
        permission: "suppliers:view",
        description: "Suppliers with contact and tax details, products, purchases and payments.",
      },
      {
        label: "Purchase requests",
        href: "/purchasing/requests",
        icon: "requests",
        permission: "purchases:view",
        description: "Requests to buy products, approved before they are ordered.",
      },
      {
        label: "Purchase orders",
        href: "/purchasing/orders",
        icon: "purchaseOrders",
        permission: "purchases:view",
        description: "Orders to suppliers and the goods received against them.",
      },
      {
        label: "Supplier invoices",
        href: "/purchasing/bills",
        icon: "bills",
        permission: "purchases:view",
        description: "Bills from suppliers, posted to Accounts Payable.",
      },
      {
        label: "Supplier payments",
        href: "/purchasing/payments",
        icon: "supplierPayments",
        permission: "purchases:view",
        description: "Money paid to suppliers against their bills.",
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        label: "Reports",
        href: "/reports",
        icon: "reports",
        permission: "reports:view",
        description: "Financial, sales, HR and inventory reports with exports.",
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        label: "Users",
        href: "/users",
        icon: "users",
        permission: "users:view",
        description: "Invite people, assign roles and control access.",
      },
      {
        label: "Roles",
        href: "/roles",
        icon: "roles",
        permission: "roles:view",
        description: "Roles and the permissions each one grants.",
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: "audit",
        permission: "audit-logs:view",
        description: "A tamper-evident history of important changes.",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: "settings",
        permission: "settings:view",
        description: "Company profile and preferences.",
      },
    ],
  },
  {
    title: "Personal",
    items: [
      {
        label: "Notifications",
        href: "/notifications",
        icon: "notifications",
        description: "Alerts and updates addressed to you.",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** The hrefs a user with these permissions may see. Computed on the server, passed to client UI. */
export function allowedNavHrefs(permissions: readonly string[]): string[] {
  return NAV_ITEMS.filter((item) => !item.permission || hasPermission(permissions, item.permission)).map(
    (item) => item.href,
  );
}

/** Sections containing only the allowed items; empty sections are dropped. */
export function visibleNavSections(allowedHrefs: readonly string[]): NavSection[] {
  const allowed = new Set(allowedHrefs);
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => allowed.has(item.href)),
  })).filter((section) => section.items.length > 0);
}

/**
 * The nav item that owns a pathname (exact match or a sub-page of it). The most specific item wins, so
 * `/projects/tasks/…` belongs to "Tasks" rather than "Projects".
 */
export function findNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

export function findNavSection(href: string): NavSection | undefined {
  return NAV_SECTIONS.find((section) => section.items.some((item) => item.href === href));
}

export function getNavItem(href: string): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.href === href);
  if (!item) throw new Error(`No navigation item for ${href}`);
  return item;
}

/** Where to send a user after sign-in: the first page they may open (the profile page always works). */
export function landingPath(permissions: readonly string[]): string {
  return allowedNavHrefs(permissions).find((href) => href !== "/notifications") ?? "/profile";
}

/** Only same-site paths are allowed as "next" targets after sign-in (prevents open redirects). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
