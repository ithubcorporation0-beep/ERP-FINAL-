import type { Module } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  /** Module whose `read` permission is required to see the link. */
  module?: Module;
}

export const NAVIGATION: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "CRM", href: "/crm", module: "customers" },
  { label: "Sales", href: "/sales", module: "invoices" },
  { label: "Finance", href: "/finance", module: "accounting" },
  { label: "HR", href: "/hr", module: "employees" },
  { label: "Projects", href: "/projects", module: "projects" },
  { label: "Inventory", href: "/inventory", module: "inventory" },
  { label: "Reports", href: "/reports", module: "reports" },
  { label: "Notifications", href: "/notifications" },
  { label: "Audit Logs", href: "/audit-logs", module: "audit-logs" },
  { label: "Settings", href: "/settings", module: "settings" },
];
