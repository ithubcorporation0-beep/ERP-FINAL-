import {
  AlertTriangle,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardList,
  FileClock,
  FilePlus2,
  FolderKanban,
  FolderPlus,
  HandCoins,
  PackagePlus,
  ReceiptText,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ActivityId, KpiId, QuickActionId } from "@/config/dashboard";

export const KPI_ICONS: Record<KpiId, LucideIcon> = {
  totalRevenue: CircleDollarSign,
  totalExpenses: Wallet,
  netProfit: TrendingUp,
  outstandingInvoices: FileClock,
  totalCustomers: Users,
  totalEmployees: BriefcaseBusiness,
  activeProjects: FolderKanban,
  pendingTasks: ClipboardList,
  lowStockItems: AlertTriangle,
};

export const ACTIVITY_ICONS: Record<ActivityId, LucideIcon> = {
  newCustomers: UserPlus,
  newInvoices: ReceiptText,
  payments: HandCoins,
  expenses: Wallet,
  employeeActivity: BriefcaseBusiness,
  projectUpdates: FolderKanban,
};

export const QUICK_ACTION_ICONS: Record<QuickActionId, LucideIcon> = {
  addCustomer: UserPlus,
  createInvoice: FilePlus2,
  addExpense: Wallet,
  addEmployee: BriefcaseBusiness,
  createProject: FolderPlus,
  addProduct: PackagePlus,
  recordPayment: HandCoins,
};
