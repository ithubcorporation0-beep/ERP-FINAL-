import { formatRecordNumber } from "@/config/crm";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { hasAnyPermission } from "@/lib/permissions";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { CustomerInput, CustomerListQuery } from "@/lib/validation";
import { customerRepository, type CustomerData } from "@/server/repositories/customer.repository";
import { leadRepository } from "@/server/repositories/lead.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { writeAuditLog } from "./audit.service";
import { recordHistory, snapshotText } from "./record-history";

/**
 * Reference service. Pattern for every module:
 * receive a TenantContext → check the permission → scope by ctx.companyId → write + audit in one transaction →
 * throw AppErrors (NotFoundError, …) for expected failures.
 */

/** "" from a form clears a value (null); a missing key leaves it unchanged (undefined). */
function blankToNull(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value === "" ? null : value;
}

export function toCustomerData(input: Partial<CustomerInput>): Partial<CustomerData> {
  return {
    name: input.name,
    companyName: blankToNull(input.companyName),
    email: blankToNull(input.email),
    phone: blankToNull(input.phone),
    whatsapp: blankToNull(input.whatsapp),
    address: blankToNull(input.address),
    city: blankToNull(input.city),
    country: blankToNull(input.country),
    taxId: blankToNull(input.taxId),
    type: input.type,
    status: input.status,
    notes: blankToNull(input.notes),
  };
}

export const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  name: "name",
  companyName: "company",
  email: "email",
  phone: "phone",
  whatsapp: "WhatsApp",
  address: "address",
  city: "city",
  country: "country",
  taxId: "tax number",
  type: "customer type",
  status: "status",
  notes: "notes",
};

const HISTORY_ACTIONS: Record<string, string> = {
  "customer.create": "Customer created",
  "customer.update": "Details updated",
  "customer.delete": "Customer deleted",
  "customer.communication_add": "Communication logged",
  "customer.communication_delete": "Communication removed",
  "customer.document_upload": "Document uploaded",
  "customer.document_delete": "Document deleted",
};

export const customerService = {
  async list(ctx: TenantContext, query: CustomerListQuery) {
    authorize(ctx, "customers:view");
    return customerRepository.list(ctx.companyId, query);
  },

  /** Customers to choose from on sales documents (blocked customers are left out). */
  async options(ctx: TenantContext) {
    if (!hasAnyPermission(ctx.permissions, ["customers:view", "quotations:create", "invoices:create"])) {
      authorize(ctx, "customers:view");
    }
    const customers = await customerRepository.listOptions(ctx.companyId, 1000);
    return customers.map((customer) => ({
      value: customer.id,
      label: `${customer.name}${customer.companyName ? ` (${customer.companyName})` : ""} · ${formatRecordNumber("customer", customer.number)}`,
    }));
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "customers:view");
    const customer = await customerRepository.findById(ctx.companyId, id);
    if (!customer) throw new NotFoundError("Customer");
    return customer;
  },

  async create(ctx: TenantContext, input: CustomerInput) {
    authorize(ctx, "customers:create");
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "customer", tx);
      const customer = await customerRepository.create(
        ctx.companyId,
        number,
        { ...toCustomerData(input), name: input.name },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        { action: "customer.create", entityType: "Customer", entityId: customer.id, after: customer },
        tx,
      );
      return customer;
    });
  },

  async update(ctx: TenantContext, id: string, input: Partial<CustomerInput>) {
    authorize(ctx, "customers:edit");
    const before = await this.get(ctx, id);
    return db.$transaction(async (tx) => {
      const after = await customerRepository.update(ctx.companyId, id, toCustomerData(input), ctx.userId, tx);
      if (!after) throw new NotFoundError("Customer");
      await writeAuditLog(
        ctx,
        { action: "customer.update", entityType: "Customer", entityId: id, before, after },
        tx,
      );
      return after;
    });
  },

  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "customers:delete");
    const before = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await customerRepository.softDelete(ctx.companyId, id, ctx.userId, tx);
      if (count === 0) throw new NotFoundError("Customer");
      await writeAuditLog(
        ctx,
        { action: "customer.delete", entityType: "Customer", entityId: id, before },
        tx,
      );
    });
  },

  /** Change history from the audit log (who changed what, when). */
  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Customer", id, {
      actions: HISTORY_ACTIONS,
      fields: CUSTOMER_FIELD_LABELS,
      detail: (action, { metadata }) => {
        if (action === "customer.create") {
          const lead = snapshotText(metadata, "fromLead");
          return lead ? `Converted from lead ${lead}` : null;
        }
        return snapshotText(metadata, "summary");
      },
    });
  },

  /** Leads that were converted into this customer; null when the user may not see leads. */
  async convertedLeads(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    if (!can(ctx, "leads:view")) return null;
    const leads = await leadRepository.listForCustomer(ctx.companyId, id);
    return leads.map((lead) => ({ ...lead, code: formatRecordNumber("lead", lead.number) }));
  },
};
