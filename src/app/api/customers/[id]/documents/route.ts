import { NextResponse } from "next/server";
import { handle, readUpload, routeId } from "@/lib/api";
import { MAX_DOCUMENT_BYTES } from "@/lib/storage/documents";
import { requirePermission } from "@/lib/tenant";
import { customerDocumentService } from "@/server/services/customer-document.service";

type Context = RouteContext<"/api/customers/[id]/documents">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("customers:view");
  const documents = await customerDocumentService.list(ctx, routeId((await params).id, "Customer"));
  return NextResponse.json(documents.map(({ storageKey: _key, ...document }) => document));
});

/** Upload as multipart form data with a `file` field. */
export const POST = handle(async (request: Request, { params }: Context) => {
  const ctx = await requirePermission("customers:edit");
  const customerId = routeId((await params).id, "Customer");
  const file = await readUpload(request, MAX_DOCUMENT_BYTES, "Files must be 10 MB or smaller.");
  const { storageKey: _key, ...document } = await customerDocumentService.upload(ctx, customerId, file);
  return NextResponse.json(document, { status: 201 });
});
