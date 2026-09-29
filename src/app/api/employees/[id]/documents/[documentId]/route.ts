import { NextResponse } from "next/server";
import { fileDownload, handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { employeeDocumentService } from "@/server/services/employee-document.service";

type Context = RouteContext<"/api/employees/[id]/documents/[documentId]">;

/** Always a download (never rendered inline), so an uploaded file can't run in the app's origin. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:view");
  const { id, documentId } = await params;
  const { document, body } = await employeeDocumentService.download(
    ctx,
    routeId(id, "Employee"),
    routeId(documentId, "Document"),
  );
  return fileDownload(body, document.name, document.contentType);
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:edit");
  const { id, documentId } = await params;
  await employeeDocumentService.remove(ctx, routeId(id, "Employee"), routeId(documentId, "Document"));
  return new NextResponse(null, { status: 204 });
});
