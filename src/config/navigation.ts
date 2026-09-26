import { hasPermission, type PermissionKey } from "@/lib/permissions";

export type NavIconName =
  | "dashboard"
  | "customers"
  | "sales"
  | "finance"
  | "hr"
  | "payroll"
  | "projects"
  | "inventory"
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
        label: "CRM",
        href: "/crm",
        icon: "customers",
        permission: "customers:view",
        description: "Customers, contacts and the lead pipeline.",
      },
      {
        label: "Sales",
        href: "/sales",
        icon: "sales",
        permission: "invoices:view",
        description: "Quotes, invoices and customer payments.",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        label: "Finance",
        href: "/finance",
        icon: "finance",
        permission: "accounting:view",
        description: "Chart of accounts, journal entries, expenses and statements.",
      },
    ],
  },
  {
    title: "People",
    items: [
      {
        label: "HR",
        href: "/hr",
        icon: "hr",
        permission: "employees:view",
        description: "Employees, attendance and leave requests.",
      },
      {
        label: "Payroll",
        href: "/payroll",
        icon: "payroll",
        permission: "payroll:view",
        description: "Payroll runs and payslips.",
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
        description: "Projects, tasks and assignments.",
      },
      {
        label: "Inventory",
        href: "/inventory",
        icon: "inventory",
        permission: "inventory:view",
        description: "Products, stock levels, suppliers and purchase orders.",
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

/** The nav item that owns a pathname (exact match or a sub-page of it). */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
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
