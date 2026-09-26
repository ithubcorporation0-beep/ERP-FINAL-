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
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "@/config/navigation";

/** Icon component for each navigation icon name. */
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: Users,
  sales: ReceiptText,
  finance: Wallet,
  hr: BriefcaseBusiness,
  payroll: WalletCards,
  projects: FolderKanban,
  inventory: Package,
  reports: ChartColumn,
  users: UserCog,
  roles: ShieldCheck,
  audit: ScrollText,
  settings: Settings,
  notifications: Bell,
};
