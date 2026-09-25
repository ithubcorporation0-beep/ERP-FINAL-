import {
  Bell,
  Briefcase,
  ChartColumn,
  FolderKanban,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Module } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Module whose `read` permission is required to see the link. */
  module?: Module;
}

export const NAVIGATION: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "CRM", href: "/crm", icon: Users, module: "customers" },
  { label: "Sales", href: "/sales", icon: ShoppingCart, module: "invoices" },
  { label: "Finance", href: "/finance", icon: Wallet, module: "accounting" },
  { label: "HR", href: "/hr", icon: Briefcase, module: "employees" },
  { label: "Projects", href: "/projects", icon: FolderKanban, module: "projects" },
  { label: "Inventory", href: "/inventory", icon: Package, module: "inventory" },
  { label: "Reports", href: "/reports", icon: ChartColumn, module: "reports" },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Audit Logs", href: "/audit-logs", icon: ScrollText, module: "audit-logs" },
  { label: "Settings", href: "/settings", icon: Settings, module: "settings" },
];
