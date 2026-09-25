import {
  Bell,
  BriefcaseBusiness,
  ChartColumn,
  FolderKanban,
  LayoutDashboard,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { hasPermission, type Module } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One-line summary, shown on the module's page and in global search. */
  description: string;
  /** Module whose `read` permission is required to see the link. Omit for items everyone sees. */
  module?: Module;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Single source of truth for the sidebar, mobile menu, breadcrumbs and global search. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
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
        icon: Users,
        module: "customers",
        description: "Customers, contacts and the lead pipeline.",
      },
      {
        label: "Sales",
        href: "/sales",
        icon: ReceiptText,
        module: "invoices",
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
        icon: Wallet,
        module: "accounting",
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
        icon: BriefcaseBusiness,
        module: "employees",
        description: "Employees, attendance and leave requests.",
      },
      {
        label: "Payroll",
        href: "/payroll",
        icon: WalletCards,
        module: "payroll",
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
        icon: FolderKanban,
        module: "projects",
        description: "Projects, tasks and assignments.",
      },
      {
        label: "Inventory",
        href: "/inventory",
        icon: Package,
        module: "inventory",
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
        icon: ChartColumn,
        module: "reports",
        description: "Financial, sales, HR and inventory reports with exports.",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        label: "Notifications",
        href: "/notifications",
        icon: Bell,
        description: "Alerts and updates addressed to you.",
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: ScrollText,
        module: "audit-logs",
        description: "A tamper-evident history of important changes.",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        module: "settings",
        description: "Company profile, users, roles and preferences.",
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** The hrefs a user with these permissions may see. Computed on the server, passed to client UI. */
export function allowedNavHrefs(permissions: readonly string[]): string[] {
  return NAV_ITEMS.filter((item) => !item.module || hasPermission(permissions, `${item.module}:read`)).map(
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
