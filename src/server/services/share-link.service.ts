import "server-only";
import { SHARE_LINK_DAYS } from "@/config/sales";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { appUrl } from "@/lib/email";
import { tokenSchema } from "@/lib/validation";
import { authorize, type TenantContext } from "@/lib/tenant";
import { ConflictError } from "@/lib/errors";
import { shareLinkRepository } from "@/server/repositories/share-link.repository";
import { writeAuditLog } from "./audit.service";
import { invoiceService } from "./invoice.service";
import { quotationService } from "./quotation.service";

export type ShareableDocument = "QUOTATION" | "INVOICE";

const PERMISSION = { QUOTATION: "quotations:edit", INVOICE: "invoices:edit" } as const;

/**
 * Share links let a customer open one document's PDF without an account (e.g. from WhatsApp). A link holds a
 * random 256-bit token; only its hash is stored, it expires after SHARE_LINK_DAYS and can be revoked. The caller
 * checks that the document exists in the current company before creating a link.
 */
export const shareLinkService = {
  async create(ctx: TenantContext, type: ShareableDocument, documentId: string, documentCode: string) {
    authorize(ctx, PERMISSION[type]);
    const { token, hash } = generateToken();
    const expiresAt = new Date(Date.now() + SHARE_LINK_DAYS * 86_400_000);
    await shareLinkRepository.create(
      ctx.companyId,
      { documentType: type, documentId, tokenHash: hash, expiresAt },
      ctx.userId,
    );
    await writeAuditLog(ctx, {
      action: type === "INVOICE" ? "invoice.share" : "quotation.share",
      entityType: type === "INVOICE" ? "Invoice" : "Quotation",
      entityId: documentId,
      metadata: {
        summary: `Link valid until ${expiresAt.toISOString().slice(0, 10)}`,
        document: documentCode,
      },
    });
    return { url: appUrl(`/api/share/${token}`), expiresAt };
  },

  /** Resolves a token from a public URL. Null for malformed, unknown, expired or revoked links. */
  async resolve(token: string) {
    if (!tokenSchema.safeParse(token).success) return null;
    const link = await shareLinkRepository.findActiveByTokenHash(hashToken(token), new Date());
    if (!link) return null;
    await shareLinkRepository.touch(link.companyId, link.id);
    return link;
  },

  /**
   * The PDF behind a public link. It runs with a read-only context limited to the link's company and the one
   * permission needed to view that document type — a link can never reach anything else.
   */
  async openDocument(token: string) {
    const link = await this.resolve(token);
    if (!link) return null;
    const ctx: TenantContext = {
      userId: link.createdById ?? "",
      companyId: link.companyId,
      roleId: "",
      roleName: "Share link",
      permissions: [link.documentType === "INVOICE" ? "invoices:view" : "quotations:view"],
    };
    return link.documentType === "INVOICE"
      ? invoiceService.pdf(ctx, link.documentId)
      : quotationService.pdf(ctx, link.documentId);
  },

  async revokeAll(ctx: TenantContext, type: ShareableDocument, documentId: string) {
    authorize(ctx, PERMISSION[type]);
    const { count } = await shareLinkRepository.revokeForDocument(ctx.companyId, type, documentId);
    if (count === 0) throw new ConflictError("There are no active share links for this document.");
    return count;
  },
};
