/**
 * CRM vocabulary shared by validation, server and UI. The value lists mirror the Prisma enums
 * (checked by tests/unit/crm-config.test.ts) but live here so browser code never imports the Prisma client.
 */

export const CUSTOMER_TYPES = ["BUSINESS", "INDIVIDUAL"] as const;
export type CustomerTypeKey = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABELS: Record<CustomerTypeKey, string> = {
  BUSINESS: "Business",
  INDIVIDUAL: "Individual",
};

export const CUSTOMER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type CustomerStatusKey = (typeof CUSTOMER_STATUSES)[number];
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatusKey, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  BLOCKED: "Blocked",
};

/** Pipeline order, left to right on the board. WON and LOST are the closed stages. */
export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
export type LeadStatusKey = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABELS: Record<LeadStatusKey, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};
export const OPEN_LEAD_STATUSES: readonly LeadStatusKey[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
];

export const LEAD_SOURCES = [
  "WEBSITE",
  "REFERRAL",
  "SOCIAL_MEDIA",
  "EMAIL_CAMPAIGN",
  "PHONE",
  "WALK_IN",
  "EVENT",
  "ADVERTISING",
  "PARTNER",
  "OTHER",
] as const;
export type LeadSourceKey = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABELS: Record<LeadSourceKey, string> = {
  WEBSITE: "Website",
  REFERRAL: "Referral",
  SOCIAL_MEDIA: "Social media",
  EMAIL_CAMPAIGN: "Email campaign",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  EVENT: "Event",
  ADVERTISING: "Advertising",
  PARTNER: "Partner",
  OTHER: "Other",
};

export const COMMUNICATION_CHANNELS = ["NOTE", "CALL", "EMAIL", "WHATSAPP", "MEETING", "SMS"] as const;
export type CommunicationChannelKey = (typeof COMMUNICATION_CHANNELS)[number];
export const COMMUNICATION_CHANNEL_LABELS: Record<CommunicationChannelKey, string> = {
  NOTE: "Note",
  CALL: "Call",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  MEETING: "Meeting",
  SMS: "SMS",
};

export const COMMUNICATION_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export type CommunicationDirectionKey = (typeof COMMUNICATION_DIRECTIONS)[number];
export const COMMUNICATION_DIRECTION_LABELS: Record<CommunicationDirectionKey, string> = {
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
};

export { formatRecordNumber, parseRecordNumber, RECORD_PREFIXES, type RecordKind } from "./records";
