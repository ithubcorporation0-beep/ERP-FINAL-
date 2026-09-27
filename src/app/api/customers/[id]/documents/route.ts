import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
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
  // Refuse obviously oversized bodies before reading them into memory.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_DOCUMENT_BYTES + 64 * 1024)
    throw new ValidationError("Files must be 10 MB or smaller.");
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) throw new ValidationError("Choose a file to upload.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new ValidationError("Files must be 10 MB or smaller.");
  const { storageKey: _key, ...document } = await customerDocumentService.upload(ctx, customerId, {
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  return NextResponse.json(document, { status: 201 });
});
