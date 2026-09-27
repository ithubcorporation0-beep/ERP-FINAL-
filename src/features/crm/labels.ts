import {
  FileText,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { StatusTone } from "@/components/shared/status-badge";
import type { CommunicationChannelKey, CustomerStatusKey, LeadStatusKey } from "@/config/crm";

export const CUSTOMER_STATUS_TONES: Record<CustomerStatusKey, StatusTone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  BLOCKED: "danger",
};

export const LEAD_STATUS_TONES: Record<LeadStatusKey, StatusTone> = {
  NEW: "info",
  CONTACTED: "info",
  QUALIFIED: "warning",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

export const CHANNEL_ICONS: Record<CommunicationChannelKey, LucideIcon> = {
  NOTE: StickyNote,
  CALL: Phone,
  EMAIL: Mail,
  WHATSAPP: MessageCircle,
  MEETING: Users,
  SMS: MessageSquare,
};

export const DOCUMENT_ICON = FileText;

/** Options for SelectInput from a value list and its labels. */
export function optionsOf<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ value, label: labels[value] }));
}
