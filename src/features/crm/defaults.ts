import type { CustomerInput, LeadInput } from "@/lib/validation";

/**
 * Form defaults, outside the "use client" form modules so server pages can read and spread them (a server
 * component only sees a client module's exports as references).
 */
export const EMPTY_CUSTOMER: CustomerInput = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  city: "",
  country: "",
  taxId: "",
  type: "BUSINESS",
  status: "ACTIVE",
  notes: "",
};

export const EMPTY_LEAD: LeadInput = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  source: "OTHER",
  assignedToId: "",
  status: "NEW",
  expectedValue: "",
  notes: "",
  followUpDate: "",
};
