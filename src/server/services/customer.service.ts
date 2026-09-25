import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { HttpError, type TenantContext } from "@/lib/tenant";
import type { CustomerInput, PaginationInput } from "@/lib/validation";
import { customerRepository } from "@/server/repositories/customer.repository";

export const customerService = {
  list(ctx: TenantContext, query: PaginationInput) {
    return customerRepository.list(ctx.organizationId, query);
  },

  async get(ctx: TenantContext, id: string) {
    const customer = await customerRepository.findById(ctx.organizationId, id);
    if (!customer) throw new HttpError(404, "Customer not found");
    return customer;
  },

  create(ctx: TenantContext, input: CustomerInput) {
    return db.$transaction(async (tx) => {
      const customer = await customerRepository.create(ctx.organizationId, input, tx);
      await writeAuditLog(ctx, { action: "create", entityType: "Customer", entityId: customer.id, after: customer }, tx);
      return customer;
    });
  },

  async update(ctx: TenantContext, id: string, input: Partial<CustomerInput>) {
    const before = await this.get(ctx, id);
    return db.$transaction(async (tx) => {
      const after = await customerRepository.update(id, input, tx);
      await writeAuditLog(ctx, { action: "update", entityType: "Customer", entityId: id, before, after }, tx);
      return after;
    });
  },

  async remove(ctx: TenantContext, id: string) {
    const before = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      await customerRepository.softDelete(id, tx);
      await writeAuditLog(ctx, { action: "delete", entityType: "Customer", entityId: id, before }, tx);
    });
  },
};
