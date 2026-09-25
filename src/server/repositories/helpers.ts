import type { Prisma } from "@/generated/prisma/client";
import type { Paginated } from "@/types";

/**
 * Repository conventions (see docs/architecture.md):
 * - Tenant-owned queries take `companyId` as the FIRST argument and always filter by it.
 * - Writes accept an optional `tx` (DbClient) so services can group them in one transaction.
 * - Writes set created_by / updated_by with the helpers below.
 * - Repositories return data or null; they never decide permissions and never throw AppErrors.
 */

/** Either the shared client (`db`) or a transaction client from `db.$transaction`. */
export type DbClient = Prisma.TransactionClient;

/** The user performing a write; `null` for system actions (e.g. the seed). */
export type ActorId = string | null;

export function createdBy(actorId: ActorId) {
  return { createdById: actorId, updatedById: actorId };
}

export function updatedBy(actorId: ActorId) {
  return { updatedById: actorId };
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

export function pageArgs({ page, pageSize }: PageQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function toPage<T>(items: T[], total: number, { page, pageSize }: PageQuery): Paginated<T> {
  return { items, total, page, pageSize };
}
