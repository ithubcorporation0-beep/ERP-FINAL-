import type { StatusTone } from "@/components/shared/status-badge";
import type { ExpenseStatusKey } from "@/config/accounting";

export const EXPENSE_STATUS_TONES: Record<ExpenseStatusKey, StatusTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};
