import "server-only";
import { PURCHASE_REQUEST_STATUS_LABELS } from "@/config/inventory";
import { formatRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { quantity } from "@/lib/inventory";
import { money } from "@/lib/money";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { PurchaseRequestInput, PurchaseRequestListQuery } from "@/lib/validation";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { productRepository } from "@/server/repositories/product.repository";
import { purchaseRequestRepository } from "@/server/repositories/purchase-request.repository";
import { supplierRepository } from "@/server/repositories/supplier.repository";
import { writeAuditLog } from "./audit.service";
import { recordHistory, snapshotText } from "./record-history";

/**
 * Purchase requests (`PR-0001`): the first step of purchasing. Anyone with `purchases:create` asks for products;
 * `purchases:approve` / `purchases:reject` decide — **never on their own request**. An approved request becomes a
 * purchase order (purchase-order.service.ts), which marks it Ordered. The requester (or `purchases:delete`) can
 * cancel a request that hasn't been ordered. `purchases:view` sees all requests; requesters without it see theirs.
 */

type PurchaseRequest = NonNullable<Awaited<ReturnType<typeof purchaseRequestRepository.findById>>>;

const HISTORY_ACTIONS: Record<string, string> = {
  "purchase_request.create": "Requested",
  "purchase_request.approve": "Approved",
  "purchase_request.reject": "Rejected",
  "purchase_request.cancel": "Cancelled",
  "purchase_request.order": "Ordered",
};

export const purchaseRequestService = {
  async list(ctx: TenantContext, query: PurchaseRequestListQuery) {
    if (!can(ctx, "purchases:view")) authorize(ctx, "purchases:create");
    const own = !can(ctx, "purchases:view") || query.mine === "1";
    return purchaseRequestRepository.list(ctx.companyId, {
      ...query,
      ...(own ? { requestedById: ctx.userId } : {}),
    });
  },

  async get(ctx: TenantContext, id: string) {
    if (!can(ctx, "purchases:view")) authorize(ctx, "purchases:create");
    const request = await purchaseRequestRepository.findById(ctx.companyId, id);
    if (!request || (!can(ctx, "purchases:view") && request.requestedById !== ctx.userId)) {
      throw new NotFoundError("Purchase request");
    }
    return request;
  },

  /** What the user may do now — drives the buttons; every action checks again. */
  abilities(ctx: TenantContext, request: PurchaseRequest) {
    const pending = request.status === "PENDING";
    const own = request.requestedById === ctx.userId;
    return {
      approve: pending && !own && can(ctx, "purchases:approve"),
      reject: pending && !own && can(ctx, "purchases:reject"),
      cancel:
        (request.status === "PENDING" || request.status === "APPROVED") &&
        (own || can(ctx, "purchases:delete")),
      order: request.status === "APPROVED" && can(ctx, "purchases:create"),
      ownPending: pending && own,
    };
  },

  async create(ctx: TenantContext, input: PurchaseRequestInput) {
    authorize(ctx, "purchases:create");
    const supplierId = input.supplierId || null;
    if (supplierId && !(await supplierRepository.findById(ctx.companyId, supplierId))) {
      throw new ValidationError("Choose a supplier.", { supplierId: ["Choose a supplier of this company."] });
    }
    const products = await productRepository.findMany(
      ctx.companyId,
      input.items.map((item) => item.productId),
    );
    const lines = input.items.map((item, index) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product || !product.isActive) {
        throw new ValidationError("Choose active products.", {
          [`items.${index}.productId`]: ["Choose an active product."],
        });
      }
      return {
        productId: product.id,
        quantity: quantity(item.quantity),
        estimatedUnitPrice: item.estimatedUnitPrice ? money(item.estimatedUnitPrice) : null,
        position: index,
      };
    });
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "purchaseRequest", tx);
      const request = await purchaseRequestRepository.create(
        ctx.companyId,
        number,
        { supplierId, neededBy: input.neededBy || null, reason: input.reason, requestedById: ctx.userId },
        lines,
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "purchase_request.create",
          entityType: "PurchaseRequest",
          entityId: request.id,
          after: {
            code: formatRecordNumber("purchaseRequest", number),
            supplierId,
            reason: input.reason,
            lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          },
        },
        tx,
      );
      return request;
    });
  },

  /** Approve, reject (reason required) or cancel. Approvers never decide their own request. */
  async decide(
    ctx: TenantContext,
    id: string,
    decision: { decision: "approve" | "reject" | "cancel"; note?: string },
  ) {
    const request = await this.get(ctx, id);
    const own = request.requestedById === ctx.userId;
    let to: "APPROVED" | "REJECTED" | "CANCELLED";
    let from: Array<"PENDING" | "APPROVED">;
    if (decision.decision === "cancel") {
      if (!own) authorize(ctx, "purchases:delete");
      from = ["PENDING", "APPROVED"];
      to = "CANCELLED";
    } else {
      authorize(ctx, decision.decision === "approve" ? "purchases:approve" : "purchases:reject");
      if (own) throw new ForbiddenError("You can't decide your own purchase request.");
      from = ["PENDING"];
      to = decision.decision === "approve" ? "APPROVED" : "REJECTED";
    }
    await db.$transaction(async (tx) => {
      const changed = await purchaseRequestRepository.setStatus(
        ctx.companyId,
        id,
        from,
        {
          status: to,
          ...(decision.decision === "cancel"
            ? {}
            : { decisionNote: decision.note || null, decidedById: ctx.userId, decidedAt: new Date() }),
        },
        ctx.userId,
        tx,
      );
      if (!changed) {
        throw new ConflictError(
          `This request is ${PURCHASE_REQUEST_STATUS_LABELS[request.status].toLowerCase()} and can't be changed that way. Reload and try again.`,
        );
      }
      await writeAuditLog(
        ctx,
        {
          action: `purchase_request.${decision.decision}`,
          entityType: "PurchaseRequest",
          entityId: id,
          before: { status: request.status },
          after: { status: to },
          metadata: { summary: decision.note || null },
        },
        tx,
      );
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "PurchaseRequest", id, {
      actions: HISTORY_ACTIONS,
      fields: {},
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },
};
