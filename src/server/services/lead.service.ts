import { formatRecordNumber, LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatusKey } from "@/config/crm";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { LeadInput, LeadListQuery } from "@/lib/validation";
import { customerRepository } from "@/server/repositories/customer.repository";
import type { DbClient } from "@/server/repositories/helpers";
import { leadRepository, type LeadData, type LeadFilters } from "@/server/repositories/lead.repository";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { writeAuditLog } from "./audit.service";
import { recordHistory, snapshotText } from "./record-history";

/** Cards per pipeline column; the column header still shows the full count and value. */
export const BOARD_COLUMN_LIMIT = 50;

function blankToNull(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value === "" ? null : value;
}

/** "YYYY-MM-DD" → the Date Prisma stores in a DATE column; "" → null. */
function toDateOnly(value: string | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === "" ? null : dateOnlyToDate(value);
}

function toLeadData(input: Partial<LeadInput>): Partial<LeadData> {
  return {
    name: input.name,
    companyName: blankToNull(input.companyName),
    email: blankToNull(input.email),
    phone: blankToNull(input.phone),
    source: input.source,
    assignedToId: blankToNull(input.assignedToId),
    status: input.status,
    // Kept as a decimal string all the way to PostgreSQL NUMERIC — no floating-point rounding.
    expectedValue: blankToNull(input.expectedValue),
    notes: blankToNull(input.notes),
    followUpDate: toDateOnly(input.followUpDate),
  };
}

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  companyName: "company",
  email: "email",
  phone: "phone",
  source: "source",
  assignedTo: "assigned to",
  status: "status",
  expectedValue: "expected value",
  notes: "notes",
  followUpDate: "follow-up date",
  customerId: "customer",
};

const HISTORY_ACTIONS: Record<string, string> = {
  "lead.create": "Lead created",
  "lead.update": "Details updated",
  "lead.status_change": "Moved in the pipeline",
  "lead.convert": "Converted to customer",
  "lead.delete": "Lead deleted",
};

/** The assignee must be an active member of THIS company — ids from the request are never trusted. */
async function assertAssignable(ctx: TenantContext, userId: string | null | undefined, client?: DbClient) {
  if (!userId) return;
  const membership = await membershipRepository.findByUser(ctx.companyId, userId, client);
  if (membership?.status !== "ACTIVE") {
    throw new ValidationError("Choose a member of this company.", {
      assignedToId: ["Choose a member of this company."],
    });
  }
}

export const leadService = {
  async list(ctx: TenantContext, query: LeadListQuery) {
    authorize(ctx, "leads:view");
    return leadRepository.list(ctx.companyId, { ...query, currentUserId: ctx.userId });
  },

  /** Every pipeline stage with its (filtered) leads, count and total expected value. */
  async board(ctx: TenantContext, filters: Omit<LeadListQuery, "page" | "pageSize" | "status">) {
    authorize(ctx, "leads:view");
    const scoped: LeadFilters = { ...filters, currentUserId: ctx.userId };
    return Promise.all(
      LEAD_STATUSES.map(async (status) => ({
        status,
        ...(await leadRepository.listStage(ctx.companyId, status, scoped, BOARD_COLUMN_LIMIT)),
      })),
    );
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "leads:view");
    const lead = await leadRepository.findById(ctx.companyId, id);
    if (!lead) throw new NotFoundError("Lead");
    return lead;
  },

  /** People a lead can be assigned to: active members of the current company. */
  async assignableUsers(ctx: TenantContext) {
    authorize(ctx, "leads:view");
    return membershipRepository.listActiveUsers(ctx.companyId);
  },

  async create(ctx: TenantContext, input: LeadInput) {
    authorize(ctx, "leads:create");
    const data = toLeadData(input);
    await assertAssignable(ctx, data.assignedToId);
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "lead", tx);
      const lead = await leadRepository.create(
        ctx.companyId,
        number,
        { ...data, name: input.name },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        { action: "lead.create", entityType: "Lead", entityId: lead.id, after: lead },
        tx,
      );
      return lead;
    });
  },

  async update(ctx: TenantContext, id: string, input: Partial<LeadInput>) {
    authorize(ctx, "leads:edit");
    const before = await this.get(ctx, id);
    const data = toLeadData(input);
    await assertAssignable(ctx, data.assignedToId);
    if (data.status && data.status !== before.status) data.statusChangedAt = new Date();
    return db.$transaction(async (tx) => {
      const after = await leadRepository.update(ctx.companyId, id, data, ctx.userId, tx);
      if (!after) throw new NotFoundError("Lead");
      await writeAuditLog(
        ctx,
        { action: "lead.update", entityType: "Lead", entityId: id, before, after },
        tx,
      );
      return after;
    });
  },

  /** Moves a lead to another pipeline stage (the board's drag and drop and "Move to" menu). */
  async setStatus(ctx: TenantContext, id: string, status: LeadStatusKey) {
    authorize(ctx, "leads:edit");
    const before = await this.get(ctx, id);
    if (before.status === status) return before;
    return db.$transaction(async (tx) => {
      const after = await leadRepository.update(
        ctx.companyId,
        id,
        { status, statusChangedAt: new Date() },
        ctx.userId,
        tx,
      );
      if (!after) throw new NotFoundError("Lead");
      await writeAuditLog(
        ctx,
        {
          action: "lead.status_change",
          entityType: "Lead",
          entityId: id,
          before: { status: before.status },
          after: { status },
          metadata: { summary: `${LEAD_STATUS_LABELS[before.status]} → ${LEAD_STATUS_LABELS[status]}` },
        },
        tx,
      );
      return after;
    });
  },

  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "leads:delete");
    const before = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await leadRepository.softDelete(ctx.companyId, id, ctx.userId, tx);
      if (count === 0) throw new NotFoundError("Lead");
      await writeAuditLog(ctx, { action: "lead.delete", entityType: "Lead", entityId: id, before }, tx);
    });
  },

  /**
   * Turns a lead into a customer: creates the customer from the lead's contact details, marks the lead as Won and
   * links the two — all in one transaction with an audit entry on both records.
   */
  async convert(ctx: TenantContext, id: string) {
    authorize(ctx, "leads:edit");
    authorize(ctx, "customers:create");
    const lead = await this.get(ctx, id);
    if (lead.customerId) throw new ConflictError("This lead has already been converted to a customer.");
    const leadCode = formatRecordNumber("lead", lead.number);

    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "customer", tx);
      const customer = await customerRepository.create(
        ctx.companyId,
        number,
        {
          name: lead.name,
          companyName: lead.companyName,
          email: lead.email,
          phone: lead.phone,
          type: lead.companyName ? "BUSINESS" : "INDIVIDUAL",
          notes: lead.notes,
        },
        ctx.userId,
        tx,
      );
      const after = await leadRepository.update(
        ctx.companyId,
        id,
        {
          customerId: customer.id,
          ...(lead.status === "WON" ? {} : { status: "WON" as const, statusChangedAt: new Date() }),
        },
        ctx.userId,
        tx,
      );
      if (!after) throw new NotFoundError("Lead");
      await writeAuditLog(
        ctx,
        {
          action: "customer.create",
          entityType: "Customer",
          entityId: customer.id,
          after: customer,
          metadata: { fromLead: leadCode, leadId: id },
        },
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "lead.convert",
          entityType: "Lead",
          entityId: id,
          before: { status: lead.status, customerId: null },
          after: { status: after.status, customerId: customer.id },
          metadata: { summary: `Customer ${formatRecordNumber("customer", customer.number)}` },
        },
        tx,
      );
      return customer;
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Lead", id, {
      actions: HISTORY_ACTIONS,
      fields: FIELD_LABELS,
      detail: (action, { metadata }) =>
        action === "lead.status_change" || action === "lead.convert"
          ? snapshotText(metadata, "summary")
          : null,
    });
  },
};
