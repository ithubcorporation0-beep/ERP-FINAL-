import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { attachmentHeader } from "@/lib/storage/documents";
import { requirePermission } from "@/lib/tenant";
import { customerDocumentService } from "@/server/services/customer-document.service";

type Context = RouteContext<"/api/customers/[id]/documents/[documentId]">;

/** Always a download (never rendered inline), so an uploaded file can't run in the app's origin. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("customers:view");
  const { id, documentId } = await params;
  const { document, body } = await customerDocumentService.download(
    ctx,
    routeId(id, "Customer"),
    routeId(documentId, "Document"),
  );
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": document.contentType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": attachmentHeader(document.name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("customers:edit");
  const { id, documentId } = await params;
  await customerDocumentService.remove(ctx, routeId(id, "Customer"), routeId(documentId, "Document"));
  return new NextResponse(null, { status: 204 });
});
