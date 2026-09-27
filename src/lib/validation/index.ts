import { z } from "zod";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
} from "@/config/crm";
import { DATE_RANGE_PRESETS, DEFAULT_DATE_RANGE } from "@/lib/date-range";
import { isCountryCode, isCurrencyCode, isLocale, isTimeZone } from "@/lib/intl";

/** Route/record ids are UUIDs; validating first turns bad ids into a 404 instead of a database error. */
export const idSchema = z.uuid("Invalid id.");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

/**
 * Dashboard URL query (`?range=last-12-months`). A missing, repeated or unknown value falls back to the default
 * range instead of failing, because it comes from an editable URL.
 */
export const dashboardQuerySchema = z.object({
  range: z.enum(DATE_RANGE_PRESETS).catch(DEFAULT_DATE_RANGE),
});

// ─── CRM ───

const PHONE = /^[+\d\s().-]*$/;
const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters.`).optional();
const optionalPhone = z
  .string()
  .trim()
  .max(30, "Use at most 30 characters.")
  .regex(PHONE, "Use digits, spaces and + ( ) - only.")
  .optional();
const optionalEmail = z
  .union([z.literal(""), z.email("Enter a valid email address.").toLowerCase().max(254)])
  .optional();

/**
 * Customer create/edit. Optional text fields accept "" (an empty form input), which clears the value; omitting a
 * field on update leaves it unchanged.
 */
export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter the customer's name.").max(200),
  companyName: optionalText(200),
  email: optionalEmail,
  phone: optionalPhone,
  whatsapp: optionalPhone,
  address: optionalText(500),
  city: optionalText(100),
  country: z.union([z.literal(""), z.string().refine(isCountryCode, "Choose a country.")]).optional(),
  taxId: optionalText(50),
  type: z.enum(CUSTOMER_TYPES).optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  notes: optionalText(5000),
});

const listFilter = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().catch(undefined);

/** Customer list URL query. Unknown filter values from a hand-edited URL are ignored rather than failing. */
export const customerListQuerySchema = paginationSchema.extend({
  status: listFilter(CUSTOMER_STATUSES),
  type: listFilter(CUSTOMER_TYPES),
  country: z.string().refine(isCountryCode).optional().catch(undefined),
  sort: z.enum(["createdAt", "name", "number"]).catch("createdAt"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
});

const communicationFields = {
  channel: z.enum(COMMUNICATION_CHANNELS),
  direction: z.union([z.literal(""), z.enum(COMMUNICATION_DIRECTIONS)]).optional(),
  subject: optionalText(200),
  body: z.string().trim().min(1, "Write what was discussed.").max(10_000),
};
const needsDirection = {
  check: (value: { channel: string; direction?: string }) =>
    value.channel === "NOTE" || Boolean(value.direction),
  params: { message: "Choose inbound or outbound.", path: ["direction"] },
};

export const communicationSchema = z
  .object({
    ...communicationFields,
    /** Defaults to now. Can't be in the future. */
    occurredAt: z.coerce
      .date("Enter a valid date and time.")
      .refine((date) => date.getTime() <= Date.now() + 60_000, "Can't be in the future.")
      .optional(),
  })
  .refine(needsDirection.check, needsDirection.params);

/** The same entry as typed in the browser form (`occurredAt` from a datetime-local input). */
export const communicationFormSchema = z
  .object({ ...communicationFields, occurredAt: z.string().min(1, "Enter when it happened.") })
  .refine(needsDirection.check, needsDirection.params);

/** "YYYY-MM-DD" (a calendar date, no time zone) or "" to clear. */
const optionalDate = z.union([z.literal(""), z.iso.date("Enter a valid date.")]).optional();

/** Money as entered: up to 16 digits and 2 decimals, never negative. Kept as a string to avoid float rounding. */
const optionalMoney = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(/^\d{1,16}(\.\d{1,2})?$/, "Enter an amount like 1500 or 1500.50."),
  ])
  .optional();

export const leadSchema = z.object({
  name: z.string().trim().min(1, "Enter the lead's name.").max(200),
  companyName: optionalText(200),
  email: optionalEmail,
  phone: optionalPhone,
  source: z.enum(LEAD_SOURCES).optional(),
  /** A member of the current company (checked on the server), or "" for unassigned. */
  assignedToId: z.union([z.literal(""), idSchema]).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  expectedValue: optionalMoney,
  notes: optionalText(5000),
  followUpDate: optionalDate,
});

export const leadStatusSchema = z.object({ id: idSchema, status: z.enum(LEAD_STATUSES) });

export const leadListQuerySchema = paginationSchema.extend({
  status: listFilter(LEAD_STATUSES),
  source: listFilter(LEAD_SOURCES),
  /** A user id, or "me" / "none". */
  assignee: z
    .union([z.enum(["me", "none"]), idSchema])
    .optional()
    .catch(undefined),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").toLowerCase(),
  password: z.string().min(1, "Enter your password.").max(200),
});

/** Password policy: long rather than complex (NIST SP 800-63B). Checked in the browser and on the server. */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.")
  .refine((value) => value.trim().length === value.length, "Remove spaces at the start or end.");

const newPasswordFields = {
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Repeat the new password."),
};

function passwordsMatch(values: { password: string; confirmPassword: string }) {
  return values.password === values.confirmPassword;
}
const mismatch = { message: "The passwords don't match.", path: ["confirmPassword"] };

const personName = z.string().trim().min(2, "Enter your full name.").max(100);
const email = z.email("Enter a valid email address.").toLowerCase().max(254);
/** Single-use link tokens are 43-character base64url strings. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This link is invalid.");

export const registerSchema = z
  .object({
    companyName: z.string().trim().min(2, "Enter your company name.").max(120),
    name: personName,
    email,
    ...newPasswordFields,
  })
  .refine(passwordsMatch, mismatch)
  .refine((values) => values.password.toLowerCase() !== values.email, {
    message: "Your password can't be your email address.",
    path: ["password"],
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ token: tokenSchema, ...newPasswordFields })
  .refine(passwordsMatch, mismatch);

export const acceptInvitationSchema = z
  .object({ token: tokenSchema, name: personName, ...newPasswordFields })
  .refine(passwordsMatch, mismatch);

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password."), ...newPasswordFields })
  .refine(passwordsMatch, mismatch)
  .refine((values) => values.password !== values.currentPassword, {
    message: "Choose a password you haven't used here.",
    path: ["password"],
  });

export const profileSchema = z.object({
  name: personName,
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s().-]*$/, "Use digits, spaces and + ( ) - only."),
  jobTitle: z.string().trim().max(80),
});

export const inviteMemberSchema = z.object({ name: personName, email, roleId: idSchema });

export const changeMemberRoleSchema = z.object({ membershipId: idSchema, roleId: idSchema });

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name.").max(60),
  description: z.string().trim().max(200),
  permissions: z.array(z.string()).max(500),
});

/** Company profile, as edited on the Settings page. Codes are validated against the ISO/IANA lists. */
export const companyProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  legalName: z.string().trim().max(200),
  taxId: z.string().trim().max(50),
  email: z.union([z.literal(""), z.email("Enter a valid email address.").toLowerCase()]),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s().-]*$/, "Use digits, spaces and + ( ) - only."),
  address: z.string().trim().max(500),
  country: z.union([z.literal(""), z.string().refine(isCountryCode, "Choose a country.")]),
  baseCurrency: z.string().refine(isCurrencyCode, "Choose a currency."),
  timezone: z.string().refine(isTimeZone, "Choose a time zone."),
  locale: z.string().refine(isLocale, "Choose a language and region."),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
});

export const preferencesSchema = z.object({
  dateFormat: z.enum(["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"]),
  weekStartsOn: z.number().int().min(0).max(6),
  invoiceNumberPrefix: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9-]+$/, "Use capital letters, digits and dashes only."),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CommunicationInput = z.infer<typeof communicationSchema>;
export type CommunicationFormInput = z.infer<typeof communicationFormSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
