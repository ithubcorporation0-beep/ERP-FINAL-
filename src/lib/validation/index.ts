import { z } from "zod";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
} from "@/config/crm";
import {
  INVOICE_DISPLAY_STATUSES,
  MAX_DOCUMENT_LINES,
  PAYMENT_METHODS,
  QUOTATION_DISPLAY_STATUSES,
} from "@/config/sales";
import {
  ACCOUNT_TYPES,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_STATUSES,
  PAID_METHODS,
  TRANSACTION_TYPES,
} from "@/config/accounting";
import { EMPLOYMENT_STATUSES, EXIT_STATUSES, LEAVE_STATUSES, LEAVE_TYPES } from "@/config/hr";
import { PAYROLL_STATUSES, SALARY_COMPONENT_KINDS } from "@/config/payroll";
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_REQUEST_STATUSES,
  STOCK_MOVEMENT_TYPES,
  STOCK_OPERATIONS,
  SUPPLIER_INVOICE_STATUSES,
} from "@/config/inventory";
import { PROJECT_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from "@/config/projects";
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

// ─── Sales ───

/** Exact decimal strings (never JS numbers) — calculated with src/lib/money.ts. */
const decimalText = (decimals: number, message: string) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{1,15}(\\.\\d{1,${decimals}})?$`), message);
const percentText = decimalText(2, "Enter a percentage like 5 or 12.5.").refine(
  (value) => Number(value) <= 100,
  "Can't be more than 100%.",
);

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Describe the product or service.").max(500),
  quantity: decimalText(3, "Enter a quantity like 1 or 2.5.").refine(
    (value) => /[1-9]/.test(value),
    "Must be more than 0.",
  ),
  unitPrice: decimalText(2, "Enter a price like 100 or 99.50."),
  discountPercent: percentText,
  taxRate: percentText,
});

const isoDate = z.iso.date("Enter a valid date.");

/**
 * A quotation or an invoice (same shape): `issueDate` is the quotation / invoice date and `endDate` the expiry /
 * due date.
 */
export const salesDocumentSchema = z
  .object({
    customerId: idSchema,
    /** Quotations only: the lead it came from ("" for none). */
    leadId: z.union([z.literal(""), idSchema]).optional(),
    issueDate: isoDate,
    endDate: isoDate,
    items: z
      .array(lineItemSchema)
      .min(1, "Add at least one line.")
      .max(MAX_DOCUMENT_LINES, `Use at most ${MAX_DOCUMENT_LINES} lines.`),
    notes: optionalText(5000),
    terms: optionalText(5000),
  })
  .refine((value) => value.endDate >= value.issueDate, {
    message: "Must be on or after the document date.",
    path: ["endDate"],
  });

export const quotationListQuerySchema = paginationSchema.extend({
  status: listFilter(QUOTATION_DISPLAY_STATUSES),
  /** Sales orders only (confirmed or invoiced quotations with an order number). */
  orders: z.enum(["1"]).optional().catch(undefined),
  customerId: idSchema.optional().catch(undefined),
});

export const invoiceListQuerySchema = paginationSchema.extend({
  status: listFilter(INVOICE_DISPLAY_STATUSES),
  customerId: idSchema.optional().catch(undefined),
});

export const paymentSchema = z.object({
  invoiceId: idSchema,
  amount: decimalText(2, "Enter an amount like 250 or 250.75.").refine(
    (value) => /[1-9]/.test(value),
    "Must be more than 0.",
  ),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  paymentDate: isoDate,
  notes: optionalText(2000),
});

export const voidPaymentSchema = z.object({
  id: idSchema,
  reason: z.string().trim().min(3, "Say why the payment is voided.").max(500),
});

export const paymentListQuerySchema = paginationSchema.extend({
  method: listFilter(PAYMENT_METHODS),
  customerId: idSchema.optional().catch(undefined),
});

/** Sending a document by email: the recipient defaults to the customer's email. */
export const sendDocumentSchema = z.object({
  id: idSchema,
  to: z.email("Enter a valid email address.").toLowerCase().max(254),
  message: optionalText(2000),
});

// ─── Expenses and accounting ───

const positiveMoney = decimalText(2, "Enter an amount like 250 or 250.75.").refine(
  (value) => /[1-9]/.test(value),
  "Must be more than 0.",
);
/** A money amount that may be empty/zero (one side of a journal line). */
const optionalMoneyText = z.union([z.literal(""), decimalText(2, "Enter an amount like 250 or 250.75.")]);

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: positiveMoney,
  expenseDate: isoDate,
  vendor: optionalText(200),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS),
  description: z.string().trim().min(1, "Describe the expense.").max(2000),
  /** The member who incurred it; "" = yourself. Only approvers may choose someone else. */
  employeeId: z.union([z.literal(""), idSchema]).optional(),
});

export const expenseListQuerySchema = paginationSchema.extend({
  status: listFilter(EXPENSE_STATUSES),
  category: listFilter(EXPENSE_CATEGORIES),
  mine: z.enum(["1"]).optional().catch(undefined),
});

export const expenseDecisionSchema = z.object({
  id: idSchema,
  note: optionalText(1000),
});

export const expenseRejectSchema = z.object({
  id: idSchema,
  note: z.string().trim().min(3, "Say why the expense is rejected.").max(1000),
});

export const expensePaySchema = z.object({
  id: idSchema,
  method: z.enum(PAID_METHODS),
  paidAt: isoDate,
});

export const accountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter an account code.")
    .max(20)
    .regex(/^[A-Za-z0-9.-]+$/, "Use letters, digits, dots and dashes."),
  name: z.string().trim().min(2, "Enter a name.").max(120),
  type: z.enum(ACCOUNT_TYPES),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

export const journalLineSchema = z.object({
  accountId: idSchema,
  debit: optionalMoneyText,
  credit: optionalMoneyText,
  description: optionalText(300),
});

/** A manual transaction. Balance (Σ debit = Σ credit) is checked by the service with exact arithmetic. */
export const journalEntrySchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  entryDate: isoDate,
  description: z.string().trim().min(1, "Describe the transaction.").max(500),
  reference: optionalText(120),
  lines: z.array(journalLineSchema).min(2, "A transaction needs at least two lines.").max(100),
});

export const journalListQuerySchema = paginationSchema.extend({
  type: listFilter(TRANSACTION_TYPES),
  accountId: idSchema.optional().catch(undefined),
  range: z.enum(DATE_RANGE_PRESETS).optional().catch(undefined),
});

/** Financial report query: a period preset, and for the balance sheet an "as of" date. */
export const reportQuerySchema = z.object({
  range: z.enum(DATE_RANGE_PRESETS).catch("this-fiscal-year"),
  asOf: isoDate.optional().catch(undefined),
});

// ─── HR ───

const optionalId = z.union([z.literal(""), idSchema]).optional();
/** "HH:MM", 24-hour clock (company time zone). */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:00.");

export const departmentSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(100),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

/** Employee profile. Salary and bank details are a separate, restricted form (compensationSchema). */
export const employeeSchema = z.object({
  name: z.string().trim().min(2, "Enter the employee's name.").max(200),
  email: optionalEmail,
  phone: optionalPhone,
  identificationNumber: z
    .string()
    .trim()
    .max(50, "Use at most 50 characters.")
    .regex(/^[A-Za-z0-9 -]*$/, "Use letters, digits, spaces and dashes only.")
    .optional(),
  departmentId: optionalId,
  position: optionalText(120),
  joiningDate: isoDate,
  /** The member who uses this record for self-service attendance and leave; "" = none. */
  userId: optionalId,
  emergencyContactName: optionalText(200),
  emergencyContactRelation: optionalText(100),
  emergencyContactPhone: optionalPhone,
  notes: optionalText(5000),
  /** Only when creating; later changes go through the status workflow. */
  status: z.enum(["PROBATION", "ACTIVE"]).optional(),
});

export const employeeStatusSchema = z
  .object({
    status: z.enum(EMPLOYMENT_STATUSES),
    exitDate: z.union([z.literal(""), isoDate]).optional(),
    note: optionalText(1000),
  })
  .refine((value) => !EXIT_STATUSES.includes(value.status) || Boolean(value.exitDate), {
    path: ["exitDate"],
    message: "Enter the last working day.",
  });

/**
 * Salary and bank details. Account number / IBAN: leave empty to keep the stored value, or set `remove…` to clear
 * it — the stored values are never sent back to the form.
 */
export const compensationSchema = z.object({
  salary: z.union([z.literal(""), decimalText(2, "Enter an amount like 85000 or 85000.50.")]),
  bankName: optionalText(120),
  accountTitle: optionalText(120),
  accountNumber: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9 -]{4,34}$/, "Use 4 to 34 letters, digits, spaces or dashes."),
    ])
    .optional(),
  iban: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .transform((value) => value.replace(/\s+/g, "").toUpperCase())
        .pipe(
          z
            .string()
            .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, "Enter a valid IBAN, e.g. PK36SCBL0000001123456702."),
        ),
    ])
    .optional(),
  removeAccountNumber: z.boolean().optional(),
  removeIban: z.boolean().optional(),
});

export const employeeListQuerySchema = paginationSchema.extend({
  status: z
    .enum([...EMPLOYMENT_STATUSES, "current"])
    .optional()
    .catch(undefined),
  departmentId: idSchema.optional().catch(undefined),
});

/** HR enters or corrects a day: times are "HH:MM" in the company time zone, or the day is marked absent. */
export const attendanceEntrySchema = z
  .object({
    employeeId: idSchema,
    date: isoDate,
    absent: z.boolean(),
    checkIn: z.union([z.literal(""), clockTime]),
    checkOut: z.union([z.literal(""), clockTime]),
    note: optionalText(500),
  })
  .superRefine((value, context) => {
    if (value.absent) return;
    if (!value.checkIn)
      context.addIssue({ code: "custom", path: ["checkIn"], message: "Enter the check-in time." });
    if (value.checkIn && value.checkOut && value.checkOut < value.checkIn) {
      context.addIssue({ code: "custom", path: ["checkOut"], message: "Can't be before the check-in." });
    }
  });

export const attendanceListQuerySchema = paginationSchema.extend({
  employeeId: idSchema.optional().catch(undefined),
  range: z.enum(DATE_RANGE_PRESETS).catch("this-month"),
});

/** `?employeeId=&date=` prefill of the attendance entry form (ignored when invalid). */
export const attendancePrefillSchema = z.object({
  employeeId: idSchema.optional().catch(undefined),
  date: isoDate.optional().catch(undefined),
});

export const attendanceReportQuerySchema = z.object({
  range: z.enum(DATE_RANGE_PRESETS).catch("this-month"),
  departmentId: idSchema.optional().catch(undefined),
});

export const leaveSchema = z
  .object({
    /** The employee on leave; "" = yourself. Only HR may file for someone else. */
    employeeId: optionalId,
    type: z.enum(LEAVE_TYPES),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().trim().min(3, "Give a short reason.").max(2000),
  })
  .refine((value) => value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "Can't be before the start date.",
  });

export const leaveListQuerySchema = paginationSchema.extend({
  employeeId: idSchema.optional().catch(undefined),
  status: listFilter(LEAVE_STATUSES),
  type: listFilter(LEAVE_TYPES),
  mine: z.enum(["1"]).optional().catch(undefined),
});

export const leaveDecisionSchema = z.object({ id: idSchema, note: optionalText(1000) });
export const leaveRejectSchema = z.object({
  id: idSchema,
  note: z.string().trim().min(3, "Say why the request is rejected.").max(1000),
});

/** API body for deciding a leave request. */
export const leaveDecisionRequestSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), note: optionalText(1000) }),
  z.object({
    decision: z.literal("reject"),
    note: z.string().trim().min(3, "Say why the request is rejected.").max(1000),
  }),
]);

/** Company work schedule (settings hr.*), edited on the Settings page. */
export const workScheduleSchema = z
  .object({
    workdayStart: clockTime,
    workdayEnd: clockTime,
    lateGraceMinutes: z.number().int().min(0, "Use 0 to 240 minutes.").max(240, "Use 0 to 240 minutes."),
    halfDayMinutes: z.number().int().min(0, "Use 0 to 720 minutes.").max(720, "Use 0 to 720 minutes."),
    workDays: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one working day."),
  })
  .refine((value) => value.workdayEnd > value.workdayStart, {
    path: ["workdayEnd"],
    message: "Must be after the start (overnight shifts aren't supported).",
  });

// ─── Payroll ───

/** A payroll amount: ≥ 0, at most 2 decimals, as an exact string. */
const payrollAmount = decimalText(2, "Enter an amount like 5000 or 5000.50.");

/** One recurring line of a salary structure. */
export const salaryComponentSchema = z.object({
  kind: z.enum(SALARY_COMPONENT_KINDS),
  name: z.string().trim().min(2, "Name the component, e.g. House rent allowance.").max(100),
  amount: payrollAmount,
  isActive: z.boolean().optional(),
});

export const salaryAdvanceSchema = z.object({
  employeeId: idSchema,
  amount: decimalText(2, "Enter an amount like 5000 or 5000.50.").refine(
    (value) => /[1-9]/.test(value),
    "Must be more than 0.",
  ),
  advanceDate: isoDate,
  paymentMethod: z.enum(PAYMENT_METHODS),
  reason: z.string().trim().min(3, "Give a short reason.").max(1000),
});

/** Process payroll for a month ("YYYY-MM"). */
export const payrollRunSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month."),
  payDate: isoDate,
  notes: optionalText(1000),
});

/** HR's per-run adjustments of one payslip (advances come from recorded advances and can't be typed in). */
export const payrollItemSchema = z.object({
  basic: payrollAmount,
  allowances: payrollAmount,
  bonus: payrollAmount,
  overtime: payrollAmount,
  deductions: payrollAmount,
  tax: payrollAmount,
  note: optionalText(500),
});

/** The snapshot of structure lines and recovered advances stored on a payroll item. */
export const payrollLinesSchema = z.array(
  z.object({
    kind: z.enum([...SALARY_COMPONENT_KINDS, "ADVANCE"]),
    name: z.string(),
    amount: z.string(),
    advanceId: idSchema.optional(),
  }),
);
export type PayrollLine = z.infer<typeof payrollLinesSchema>[number];

export const payrollListQuerySchema = paginationSchema.extend({
  status: listFilter(PAYROLL_STATUSES),
});

export const payrollDecisionSchema = z.object({ id: idSchema, note: optionalText(1000) });
export const payrollReasonSchema = z.object({
  id: idSchema,
  note: z.string().trim().min(3, "Give a reason.").max(1000),
});
export const payrollPaySchema = z.object({
  id: idSchema,
  paidAt: isoDate,
  method: z.enum(PAYMENT_METHODS),
});

/** API body for a payroll run's workflow step. */
export const payrollStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("approve"), note: optionalText(1000) }),
  z.object({ action: z.literal("reject"), note: z.string().trim().min(3, "Give a reason.").max(1000) }),
  z.object({ action: z.literal("cancel"), note: z.string().trim().min(3, "Give a reason.").max(1000) }),
  z.object({ action: z.literal("pay"), paidAt: isoDate, method: z.enum(PAYMENT_METHODS) }),
]);

export const payrollReportQuerySchema = z.object({
  range: z.enum(DATE_RANGE_PRESETS).catch("this-fiscal-year"),
});

// ─── Projects and tasks ───

export const projectSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a project name.").max(200),
    customerId: optionalId,
    managerId: optionalId,
    startDate: optionalDate,
    endDate: optionalDate,
    budget: z.union([z.literal(""), decimalText(2, "Enter an amount like 250000 or 250000.50.")]).optional(),
    status: z.enum(PROJECT_STATUSES),
    description: optionalText(5000),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "Can't be before the start date.",
  });

export const projectListQuerySchema = paginationSchema.extend({
  status: z
    .enum([...PROJECT_STATUSES, "open"])
    .optional()
    .catch(undefined),
  customerId: idSchema.optional().catch(undefined),
});

export const taskSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a task name.").max(300),
    projectId: z.uuid("Choose a project."),
    assigneeId: optionalId,
    priority: z.enum(TASK_PRIORITIES),
    status: z.enum(TASK_STATUSES),
    startDate: optionalDate,
    dueDate: optionalDate,
    description: optionalText(5000),
  })
  .refine((value) => !value.startDate || !value.dueDate || value.dueDate >= value.startDate, {
    path: ["dueDate"],
    message: "Can't be before the start date.",
  });

export const taskListQuerySchema = paginationSchema.extend({
  projectId: idSchema.optional().catch(undefined),
  assigneeId: idSchema.optional().catch(undefined),
  status: z
    .enum([...TASK_STATUSES, "open"])
    .optional()
    .catch(undefined),
  priority: listFilter(TASK_PRIORITIES),
  due: z.enum(["overdue", "soon"]).optional().catch(undefined),
  mine: z.enum(["1"]).optional().catch(undefined),
});

export const taskStatusSchema = z.object({ id: idSchema, status: z.enum(TASK_STATUSES) });
export const taskAssignSchema = z.object({ id: idSchema, assigneeId: optionalId });

// ─── Inventory and purchasing ───

/** A quantity > 0 with up to 3 decimals, as an exact string. */
const positiveQuantity = decimalText(3, "Enter a quantity like 1 or 2.5.").refine(
  (value) => /[1-9]/.test(value),
  "Must be more than 0.",
);
const moneyText = decimalText(2, "Enter an amount like 100 or 99.50.");
const MAX_PURCHASE_LINES = 100;

export const productCategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(100),
  description: optionalText(500),
});

export const warehouseSchema = z.object({
  name: z.string().trim().min(1, "Enter a warehouse name.").max(100),
  address: optionalText(500),
  isActive: z.boolean().optional(),
});

export const productSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "Enter a SKU.")
    .max(64)
    .regex(/^[A-Za-z0-9._\/-]+$/, "Use letters, digits and . _ - / only (no spaces)."),
  name: z.string().trim().min(2, "Enter a product name.").max(200),
  categoryId: optionalId,
  brand: optionalText(100),
  unit: z.string().trim().min(1, "Enter a unit such as pcs or kg.").max(20),
  purchasePrice: moneyText,
  sellingPrice: moneyText,
  minimumStock: decimalText(3, "Enter a quantity like 0, 5 or 2.5."),
  supplierId: optionalId,
  warehouseId: optionalId,
  description: optionalText(2000),
  isActive: z.boolean().optional(),
});

export const productListQuerySchema = paginationSchema.extend({
  categoryId: idSchema.optional().catch(undefined),
  supplierId: idSchema.optional().catch(undefined),
  warehouseId: idSchema.optional().catch(undefined),
  stock: z.enum(["low", "out"]).optional().catch(undefined),
  inactive: z.enum(["1"]).optional().catch(undefined),
});

/**
 * A stock operation typed by hand. IN / OUT: quantity to add / remove. ADJUST: the counted quantity (the stock is
 * set to it; the difference is recorded). TRANSFER: quantity moved from `warehouseId` to `toWarehouseId`.
 */
export const stockOperationSchema = z
  .object({
    operation: z.enum(STOCK_OPERATIONS),
    productId: idSchema,
    warehouseId: z.uuid("Choose a warehouse."),
    toWarehouseId: optionalId,
    quantity: decimalText(3, "Enter a quantity like 1 or 2.5."),
    unitCost: z.union([z.literal(""), moneyText]).optional(),
    movementDate: isoDate,
    reference: optionalText(120),
    note: optionalText(1000),
  })
  .refine((value) => value.operation === "ADJUST" || /[1-9]/.test(value.quantity), {
    path: ["quantity"],
    message: "Must be more than 0.",
  })
  .refine((value) => value.operation !== "TRANSFER" || Boolean(value.toWarehouseId), {
    path: ["toWarehouseId"],
    message: "Choose the warehouse to move the stock to.",
  })
  .refine((value) => value.operation !== "TRANSFER" || value.toWarehouseId !== value.warehouseId, {
    path: ["toWarehouseId"],
    message: "Choose a different warehouse.",
  })
  .refine((value) => value.operation !== "ADJUST" || Boolean(value.note?.trim()), {
    path: ["note"],
    message: "Say why the stock is adjusted (e.g. stock count, damage).",
  });

export const stockMovementListQuerySchema = paginationSchema.extend({
  productId: idSchema.optional().catch(undefined),
  warehouseId: idSchema.optional().catch(undefined),
  type: listFilter(STOCK_MOVEMENT_TYPES),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Enter the supplier's name.").max(200),
  companyName: optionalText(200),
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(500),
  taxId: optionalText(50),
  notes: optionalText(5000),
  isActive: z.boolean().optional(),
});

export const supplierListQuerySchema = paginationSchema.extend({
  inactive: z.enum(["1"]).optional().catch(undefined),
});

const purchaseRequestLineSchema = z.object({
  productId: z.uuid("Choose a product."),
  quantity: positiveQuantity,
  estimatedUnitPrice: z.union([z.literal(""), moneyText]).optional(),
});

export const purchaseRequestSchema = z.object({
  supplierId: optionalId,
  neededBy: optionalDate,
  reason: z.string().trim().min(3, "Say what the purchase is for.").max(2000),
  items: z
    .array(purchaseRequestLineSchema)
    .min(1, "Add at least one product.")
    .max(MAX_PURCHASE_LINES, `Use at most ${MAX_PURCHASE_LINES} lines.`),
});

export const purchaseRequestDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), note: optionalText(1000) }),
  z.object({ decision: z.literal("reject"), note: z.string().trim().min(3, "Give a reason.").max(1000) }),
  z.object({ decision: z.literal("cancel"), note: optionalText(1000) }),
]);

export const purchaseRequestListQuerySchema = paginationSchema.extend({
  status: listFilter(PURCHASE_REQUEST_STATUSES),
  mine: z.enum(["1"]).optional().catch(undefined),
});

const purchaseOrderLineSchema = z.object({
  productId: z.uuid("Choose a product."),
  quantity: positiveQuantity,
  unitPrice: moneyText,
});

export const purchaseOrderSchema = z
  .object({
    supplierId: z.uuid("Choose a supplier."),
    warehouseId: z.uuid("Choose the warehouse that receives the goods."),
    /** The approved purchase request this order fulfils ("" for none). */
    requestId: optionalId,
    orderDate: isoDate,
    expectedDate: optionalDate,
    notes: optionalText(5000),
    items: z
      .array(purchaseOrderLineSchema)
      .min(1, "Add at least one product.")
      .max(MAX_PURCHASE_LINES, `Use at most ${MAX_PURCHASE_LINES} lines.`),
  })
  .refine((value) => !value.expectedDate || value.expectedDate >= value.orderDate, {
    path: ["expectedDate"],
    message: "Can't be before the order date.",
  });

export const purchaseOrderStatusSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("order") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3, "Give a reason.").max(500) }),
]);

export const purchaseOrderListQuerySchema = paginationSchema.extend({
  status: listFilter(PURCHASE_ORDER_STATUSES),
  supplierId: idSchema.optional().catch(undefined),
});

export const goodsReceiptSchema = z.object({
  receivedDate: isoDate,
  note: optionalText(1000),
  /** Only lines with a quantity are received; the rest stay open. */
  items: z
    .array(
      z.object({
        orderItemId: idSchema,
        quantity: z.union([z.literal(""), decimalText(3, "Enter a quantity like 1 or 2.5.")]),
      }),
    )
    .min(1)
    .max(MAX_PURCHASE_LINES),
});

export const supplierInvoiceSchema = z
  .object({
    supplierId: z.uuid("Choose a supplier."),
    orderId: optionalId,
    supplierReference: optionalText(80),
    invoiceDate: isoDate,
    dueDate: optionalDate,
    subtotal: positiveMoney,
    taxAmount: moneyText,
    notes: optionalText(2000),
  })
  .refine((value) => !value.dueDate || value.dueDate >= value.invoiceDate, {
    path: ["dueDate"],
    message: "Can't be before the invoice date.",
  });

export const supplierInvoiceListQuerySchema = paginationSchema.extend({
  status: listFilter(SUPPLIER_INVOICE_STATUSES),
  supplierId: idSchema.optional().catch(undefined),
  open: z.enum(["1"]).optional().catch(undefined),
});

export const cancelSupplierInvoiceSchema = z.object({
  reason: z.string().trim().min(3, "Say why the bill is cancelled.").max(500),
});

export const supplierPaymentSchema = z.object({
  invoiceId: idSchema,
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  paymentDate: isoDate,
  notes: optionalText(2000),
});

export const supplierPaymentListQuerySchema = paginationSchema.extend({
  supplierId: idSchema.optional().catch(undefined),
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
  paymentTermsDays: z.number().int().min(0, "Use 0 to 365 days.").max(365, "Use 0 to 365 days."),
  quotationValidityDays: z.number().int().min(1, "Use 1 to 365 days.").max(365, "Use 1 to 365 days."),
  documentTerms: z.string().trim().max(2000),
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
export type LineItemInput = z.infer<typeof lineItemSchema>;
export type SalesDocumentInput = z.infer<typeof salesDocumentSchema>;
export type QuotationListQuery = z.infer<typeof quotationListQuerySchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type SendDocumentInput = z.infer<typeof sendDocumentSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
export type EmployeeStatusInput = z.infer<typeof employeeStatusSchema>;
export type CompensationInput = z.input<typeof compensationSchema>;
export type CompensationData = z.output<typeof compensationSchema>;
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type AttendanceEntryInput = z.infer<typeof attendanceEntrySchema>;
export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;
export type LeaveInput = z.infer<typeof leaveSchema>;
export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;
export type WorkScheduleInput = z.infer<typeof workScheduleSchema>;
export type SalaryComponentInput = z.infer<typeof salaryComponentSchema>;
export type SalaryAdvanceInput = z.infer<typeof salaryAdvanceSchema>;
export type PayrollRunInput = z.infer<typeof payrollRunSchema>;
export type PayrollItemInput = z.infer<typeof payrollItemSchema>;
export type PayrollListQuery = z.infer<typeof payrollListQuerySchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type ProductCategoryInput = z.infer<typeof productCategorySchema>;
export type WarehouseInput = z.infer<typeof warehouseSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type StockOperationInput = z.infer<typeof stockOperationSchema>;
export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
export type PurchaseRequestInput = z.infer<typeof purchaseRequestSchema>;
export type PurchaseRequestListQuery = z.infer<typeof purchaseRequestListQuerySchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;
export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;
export type SupplierInvoiceInput = z.infer<typeof supplierInvoiceSchema>;
export type SupplierInvoiceListQuery = z.infer<typeof supplierInvoiceListQuerySchema>;
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
export type JournalListQuery = z.infer<typeof journalListQuerySchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
