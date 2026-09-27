import type { ShareDocumentType } from "@/generated/prisma/client";
import { crossTenant, db } from "@/lib/db";
import type { ActorId, DbClient } from "./helpers";

export const shareLinkRepository = {
  create(
    companyId: string,
    data: { documentType: ShareDocumentType; documentId: string; tokenHash: string; expiresAt: Date },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.shareLink.create({
      data: { ...data, companyId, createdById: actorId },
      select: { id: true, expiresAt: true },
    });
  },

  /**
   * Looks a link up by its token hash for a visitor without an account. The company isn't known until the link
   * is found — this is the one deliberate cross-company read; the hash is a 256-bit secret.
   */
  findActiveByTokenHash(tokenHash: string, now: Date) {
    return crossTenant("public share link lookup by secret token", () =>
      db.shareLink.findFirst({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true, companyId: true, documentType: true, documentId: true, createdById: true },
      }),
    );
  },

  touch(companyId: string, id: string, client: DbClient = db) {
    return client.shareLink.updateMany({ where: { id, companyId }, data: { lastAccessedAt: new Date() } });
  },

  revokeForDocument(
    companyId: string,
    documentType: ShareDocumentType,
    documentId: string,
    client: DbClient = db,
  ) {
    return client.shareLink.updateMany({
      where: { companyId, documentType, documentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
