import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import type { CustomerInput, PaginationInput } from "@/lib/validation";
import { customerRepository } from "@/server/repositories/customer.repository";
import { writeAuditLog } from "./audit.service";

/**
 * Reference service. Pattern for every module:
 * receive a TenantContext → scope by ctx.companyId → write + audit in one transaction →
 * throw AppErrors (NotFoundError, …) for expected failures.
 */
export const customerService = {
  list(ctx: TenantContext, query: PaginationInput) {
    return customerRepository.list(ctx.companyId, query);
  },

  async get(ctx: TenantContext, id: string) {
    const customer = await customerRepository.findById(ctx.companyId, id);
    if (!customer) throw new NotFoundError("Customer");
    return customer;
  },

  create(ctx: TenantContext, input: CustomerInput) {
    return db.$transaction(async (tx) => {
      const customer = await customerRepository.create(ctx.companyId, input, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        { action: "customer.create", entityType: "Customer", entityId: customer.id, after: customer },
        tx,
      );
      return customer;
    });
  },

  async update(ctx: TenantContext, id: string, input: Partial<CustomerInput>) {
    const before = await this.get(ctx, id);
    return db.$transaction(async (tx) => {
      const after = await customerRepository.update(ctx.companyId, id, input, ctx.userId, tx);
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
};
