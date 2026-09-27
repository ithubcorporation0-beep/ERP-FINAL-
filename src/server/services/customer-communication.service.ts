import { COMMUNICATION_CHANNEL_LABELS } from "@/config/crm";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { CommunicationInput } from "@/lib/validation";
import { customerCommunicationRepository } from "@/server/repositories/customer-communication.repository";
import { writeAuditLog } from "./audit.service";
import { customerService } from "./customer.service";

const LIST_LIMIT = 100;

/** Communication log and notes on a customer. Reading needs customers:view; writing needs customers:edit. */
export const customerCommunicationService = {
  async list(ctx: TenantContext, customerId: string) {
    await customerService.get(ctx, customerId);
    const [items, total] = await Promise.all([
      customerCommunicationRepository.list(ctx.companyId, customerId, { limit: LIST_LIMIT }),
      customerCommunicationRepository.count(ctx.companyId, customerId),
    ]);
    return { items, total };
  },

  async add(ctx: TenantContext, customerId: string, input: CommunicationInput) {
    authorize(ctx, "customers:edit");
    await customerService.get(ctx, customerId);
    return db.$transaction(async (tx) => {
      const entry = await customerCommunicationRepository.create(
        ctx.companyId,
        customerId,
        {
          channel: input.channel,
          direction: input.channel === "NOTE" || !input.direction ? null : input.direction,
          subject: input.subject || null,
          body: input.body,
          occurredAt: input.occurredAt ?? new Date(),
        },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "customer.communication_add",
          entityType: "Customer",
          entityId: customerId,
          after: entry,
          metadata: {
            communicationId: entry.id,
            summary: `${COMMUNICATION_CHANNEL_LABELS[entry.channel]}${entry.subject ? `: ${entry.subject}` : ""}`,
          },
        },
        tx,
      );
      return entry;
    });
  },

  async remove(ctx: TenantContext, customerId: string, id: string) {
    authorize(ctx, "customers:edit");
    await customerService.get(ctx, customerId);
    const before = await customerCommunicationRepository.findById(ctx.companyId, customerId, id);
    if (!before) throw new NotFoundError("Communication");
    await db.$transaction(async (tx) => {
      const { count } = await customerCommunicationRepository.delete(ctx.companyId, customerId, id, tx);
      if (count === 0) throw new NotFoundError("Communication");
      await writeAuditLog(
        ctx,
        {
          action: "customer.communication_delete",
          entityType: "Customer",
          entityId: customerId,
          before,
          metadata: { communicationId: id, summary: COMMUNICATION_CHANNEL_LABELS[before.channel] },
        },
        tx,
      );
    });
  },
};
