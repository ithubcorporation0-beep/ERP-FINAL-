import "server-only";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { companyKey } from "@/lib/storage";
import { authorize, type TenantContext } from "@/lib/tenant";
import { customerDocumentRepository } from "@/server/repositories/customer-document.repository";
import { writeAuditLog } from "./audit.service";
import { customerService } from "./customer.service";
import {
  checkDocument,
  deleteStoredQuietly,
  readStored,
  storeThenRecord,
  type UploadedFile,
} from "./stored-files";

/**
 * Files attached to a customer. Bytes go to file storage under companies/<companyId>/customers/<customerId>/;
 * the database row is written in the same step as the audit entry, and the file is removed again if that fails.
 */
export const customerDocumentService = {
  async list(ctx: TenantContext, customerId: string) {
    await customerService.get(ctx, customerId);
    return customerDocumentRepository.list(ctx.companyId, customerId);
  },

  async upload(ctx: TenantContext, customerId: string, file: UploadedFile) {
    authorize(ctx, "customers:edit");
    await customerService.get(ctx, customerId);
    const { name, type } = checkDocument(file);
    const key = companyKey(
      ctx.companyId,
      "customers",
      customerId,
      `${crypto.randomUUID()}.${type.extension}`,
    );
    return storeThenRecord(key, file.bytes, type.contentType, () =>
      db.$transaction(async (tx) => {
        const document = await customerDocumentRepository.create(
          ctx.companyId,
          {
            customerId,
            name,
            storageKey: key,
            contentType: type.contentType,
            sizeBytes: file.bytes.byteLength,
          },
          ctx.userId,
          tx,
        );
        await writeAuditLog(
          ctx,
          {
            action: "customer.document_upload",
            entityType: "Customer",
            entityId: customerId,
            after: { id: document.id, name, contentType: type.contentType, sizeBytes: file.bytes.byteLength },
            metadata: { documentId: document.id, summary: name },
          },
          tx,
        );
        return document;
      }),
    );
  },

  /** The file for download. Only documents of this customer in this company are reachable. */
  async download(ctx: TenantContext, customerId: string, id: string) {
    await customerService.get(ctx, customerId);
    const document = await customerDocumentRepository.findById(ctx.companyId, customerId, id);
    if (!document) throw new NotFoundError("Document");
    return { document, body: await readStored(document.storageKey, "Document") };
  },

  async remove(ctx: TenantContext, customerId: string, id: string) {
    authorize(ctx, "customers:edit");
    await customerService.get(ctx, customerId);
    const document = await customerDocumentRepository.findById(ctx.companyId, customerId, id);
    if (!document) throw new NotFoundError("Document");
    await db.$transaction(async (tx) => {
      const { count } = await customerDocumentRepository.delete(ctx.companyId, customerId, id, tx);
      if (count === 0) throw new NotFoundError("Document");
      await writeAuditLog(
        ctx,
        {
          action: "customer.document_delete",
          entityType: "Customer",
          entityId: customerId,
          before: { id, name: document.name },
          metadata: { documentId: id, summary: document.name },
        },
        tx,
      );
    });
    // The row is gone, so the file is unreachable; a failed cleanup only leaves an orphan, which is logged.
    await deleteStoredQuietly(document.storageKey);
  },
};
