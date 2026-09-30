import type { StatusTone } from "@/components/shared/status-badge";
import type { PayrollStatusKey, SalaryAdvanceStatusKey } from "@/config/payroll";

export const PAYROLL_STATUS_TONES: Record<PayrollStatusKey, StatusTone> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "info",
  PAID: "success",
  CANCELLED: "danger",
};

export const ADVANCE_STATUS_TONES: Record<SalaryAdvanceStatusKey, StatusTone> = {
  OUTSTANDING: "warning",
  RECOVERED: "success",
  CANCELLED: "neutral",
};
