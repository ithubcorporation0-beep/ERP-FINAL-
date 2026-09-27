import "server-only";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { companyKey, getStorage } from "@/lib/storage";
import {
  cleanFileName,
  detectDocumentType,
  DOCUMENT_TYPES_HINT,
  MAX_DOCUMENT_BYTES,
} from "@/lib/storage/documents";
import { authorize, type TenantContext } from "@/lib/tenant";
import { customerDocumentRepository } from "@/server/repositories/customer-document.repository";
import { writeAuditLog } from "./audit.service";
import { customerService } from "./customer.service";

/**
 * Files attached to a customer. Bytes go to file storage under companies/<companyId>/customers/<customerId>/;
 * the database row is written in the same step as the audit entry, and the file is removed again if that fails.
 */
export const customerDocumentService = {
  async list(ctx: TenantContext, customerId: string) {
    await customerService.get(ctx, customerId);
    return customerDocumentRepository.list(ctx.companyId, customerId);
  },

  async upload(ctx: TenantContext, customerId: string, file: { name: string; bytes: Uint8Array }) {
    authorize(ctx, "customers:edit");
    await customerService.get(ctx, customerId);
    if (file.bytes.byteLength === 0) throw new ValidationError("Choose a file to upload.");
    if (file.bytes.byteLength > MAX_DOCUMENT_BYTES)
      throw new ValidationError("Files must be 10 MB or smaller.");
    const name = cleanFileName(file.name);
    const type = detectDocumentType(file.bytes, name);
    if (!type) throw new ValidationError(`Upload a ${DOCUMENT_TYPES_HINT} file.`);

    const key = companyKey(
      ctx.companyId,
      "customers",
      customerId,
      `${crypto.randomUUID()}.${type.extension}`,
    );
    const storage = getStorage();
    await storage.put(key, file.bytes, type.contentType);
    try {
      return await db.$transaction(async (tx) => {
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
      });
    } catch (error) {
      await storage
        .delete(key)
        .catch((cleanupError: unknown) => logger.warn("Orphaned document file", { key, cleanupError }));
      throw error;
    }
  },

  /** The file for download. Only documents of this customer in this company are reachable. */
  async download(ctx: TenantContext, customerId: string, id: string) {
    await customerService.get(ctx, customerId);
    const document = await customerDocumentRepository.findById(ctx.companyId, customerId, id);
    if (!document) throw new NotFoundError("Document");
    const body = await getStorage().get(document.storageKey);
    if (!body) {
      logger.error("Document file missing from storage", { documentId: id, key: document.storageKey });
      throw new NotFoundError("Document");
    }
    return { document, body };
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
    await getStorage()
      .delete(document.storageKey)
      .catch((error: unknown) =>
        logger.warn("Could not delete document file", { key: document.storageKey, error }),
      );
  },
};
