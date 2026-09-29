import "server-only";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { companyKey } from "@/lib/storage";
import { authorize, type TenantContext } from "@/lib/tenant";
import { employeeDocumentRepository } from "@/server/repositories/employee-document.repository";
import { writeAuditLog } from "./audit.service";
import { employeeService } from "./employee.service";
import {
  checkDocument,
  deleteStoredQuietly,
  readStored,
  storeThenRecord,
  type UploadedFile,
} from "./stored-files";

/**
 * Files attached to an employee (contracts, ID copies, certificates). Bytes go to file storage under
 * companies/<companyId>/employees/<employeeId>/documents/;
 * the database row is written in the same step as the audit entry, and the file is removed again if that fails.
 */
export const employeeDocumentService = {
  async list(ctx: TenantContext, employeeId: string) {
    await employeeService.get(ctx, employeeId);
    return employeeDocumentRepository.list(ctx.companyId, employeeId);
  },

  async upload(ctx: TenantContext, employeeId: string, file: UploadedFile) {
    authorize(ctx, "employees:edit");
    await employeeService.get(ctx, employeeId);
    const { name, type } = checkDocument(file);
    const key = companyKey(
      ctx.companyId,
      "employees",
      employeeId,
      "documents",
      `${crypto.randomUUID()}.${type.extension}`,
    );
    return storeThenRecord(key, file.bytes, type.contentType, () =>
      db.$transaction(async (tx) => {
        const document = await employeeDocumentRepository.create(
          ctx.companyId,
          {
            employeeId,
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
            action: "employee.document_upload",
            entityType: "Employee",
            entityId: employeeId,
            after: { id: document.id, name, contentType: type.contentType, sizeBytes: file.bytes.byteLength },
            metadata: { documentId: document.id, summary: name },
          },
          tx,
        );
        return document;
      }),
    );
  },

  /** The file for download. Only documents of this employee in this company are reachable. */
  async download(ctx: TenantContext, employeeId: string, id: string) {
    await employeeService.get(ctx, employeeId);
    const document = await employeeDocumentRepository.findById(ctx.companyId, employeeId, id);
    if (!document) throw new NotFoundError("Document");
    return { document, body: await readStored(document.storageKey, "Document") };
  },

  async remove(ctx: TenantContext, employeeId: string, id: string) {
    authorize(ctx, "employees:edit");
    await employeeService.get(ctx, employeeId);
    const document = await employeeDocumentRepository.findById(ctx.companyId, employeeId, id);
    if (!document) throw new NotFoundError("Document");
    await db.$transaction(async (tx) => {
      const { count } = await employeeDocumentRepository.delete(ctx.companyId, employeeId, id, tx);
      if (count === 0) throw new NotFoundError("Document");
      await writeAuditLog(
        ctx,
        {
          action: "employee.document_delete",
          entityType: "Employee",
          entityId: employeeId,
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
