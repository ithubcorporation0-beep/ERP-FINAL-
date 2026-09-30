import "server-only";
import { formatRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { SupplierInput, SupplierListQuery } from "@/lib/validation";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { purchaseOrderRepository } from "@/server/repositories/purchase-order.repository";
import { supplierInvoiceRepository } from "@/server/repositories/supplier-invoice.repository";
import { supplierRepository, type SupplierData } from "@/server/repositories/supplier.repository";
import { writeAuditLog } from "./audit.service";
import { productService } from "./product.service";
import { recordHistory } from "./record-history";

/**
 * Suppliers (`SUP-0001`). `suppliers:view` to read; `suppliers:create` / `edit` / `delete` to change. The supplier
 * page also lists the supplier's products (`products:view`), purchase history (`purchases:view`) and payment
 * history (`purchases:view`). A supplier with orders or bills can't be deleted — deactivate it instead.
 */

type Supplier = NonNullable<Awaited<ReturnType<typeof supplierRepository.findById>>>;

function snapshot(supplier: Supplier) {
  return {
    code: formatRecordNumber("supplier", supplier.number),
    name: supplier.name,
    companyName: supplier.companyName,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    taxId: supplier.taxId,
    notes: supplier.notes,
    isActive: supplier.isActive,
  };
}

function data(input: SupplierInput, before?: Supplier): SupplierData {
  return {
    name: input.name,
    companyName: input.companyName || null,
    phone: input.phone || null,
    email: input.email || null,
    address: input.address || null,
    taxId: input.taxId || null,
    notes: input.notes || null,
    isActive: input.isActive ?? before?.isActive ?? true,
  };
}

export const supplierService = {
  async list(ctx: TenantContext, query: SupplierListQuery) {
    authorize(ctx, "suppliers:view");
    return supplierRepository.list(ctx.companyId, query);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "suppliers:view");
    const supplier = await supplierRepository.findById(ctx.companyId, id);
    if (!supplier) throw new NotFoundError("Supplier");
    return supplier;
  },

  /** Active suppliers to choose from (products, purchase requests, orders, bills). */
  async options(ctx: TenantContext) {
    if (!can(ctx, "purchases:view") && !can(ctx, "products:create")) authorize(ctx, "suppliers:view");
    const suppliers = await supplierRepository.options(ctx.companyId);
    return suppliers.map((supplier) => ({
      value: supplier.id,
      label: `${supplier.name} · ${formatRecordNumber("supplier", supplier.number)}`,
    }));
  },

  /** Products, purchase orders, bills and payments of a supplier — each only with its own view permission. */
  async related(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    const purchases = can(ctx, "purchases:view");
    const [products, orders, invoices, payments] = await Promise.all([
      can(ctx, "products:view") ? productService.forSupplier(ctx, id) : null,
      purchases ? purchaseOrderRepository.listForSupplier(ctx.companyId, id) : null,
      purchases ? supplierInvoiceRepository.listForSupplier(ctx.companyId, id) : null,
      purchases
        ? supplierInvoiceRepository.listPayments(ctx.companyId, { page: 1, pageSize: 100, supplierId: id })
        : null,
    ]);
    return { products, orders, invoices, payments: payments?.items ?? null };
  },

  async create(ctx: TenantContext, input: SupplierInput) {
    authorize(ctx, "suppliers:create");
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "supplier", tx);
      const supplier = await supplierRepository.create(ctx.companyId, number, data(input), ctx.userId, tx);
      await writeAuditLog(
        ctx,
        {
          action: "supplier.create",
          entityType: "Supplier",
          entityId: supplier.id,
          after: snapshot(supplier),
        },
        tx,
      );
      return supplier;
    });
  },

  async update(ctx: TenantContext, id: string, input: SupplierInput) {
    authorize(ctx, "suppliers:edit");
    const before = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      if (!(await supplierRepository.update(ctx.companyId, id, data(input, before), ctx.userId, tx)))
        throw new NotFoundError("Supplier");
      const after = await supplierRepository.findById(ctx.companyId, id, tx);
      if (!after) throw new NotFoundError("Supplier");
      await writeAuditLog(
        ctx,
        {
          action: "supplier.update",
          entityType: "Supplier",
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
    });
  },

  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "suppliers:delete");
    const supplier = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await supplierRepository.softDelete(ctx.companyId, id, ctx.userId, tx);
      if (count === 0) {
        throw new ConflictError(
          "Suppliers with purchase orders or bills can't be deleted. Deactivate it instead.",
        );
      }
      await writeAuditLog(
        ctx,
        { action: "supplier.delete", entityType: "Supplier", entityId: id, before: snapshot(supplier) },
        tx,
      );
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Supplier", id, {
      actions: { "supplier.create": "Created", "supplier.update": "Updated", "supplier.delete": "Deleted" },
      fields: {
        name: "name",
        companyName: "company",
        phone: "phone",
        email: "email",
        address: "address",
        taxId: "tax information",
        notes: "notes",
        isActive: "active",
      },
    });
  },
};
