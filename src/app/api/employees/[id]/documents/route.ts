import { NextResponse } from "next/server";
import { handle, readUpload, routeId } from "@/lib/api";
import { MAX_DOCUMENT_BYTES } from "@/lib/storage/documents";
import { requirePermission } from "@/lib/tenant";
import { employeeDocumentService } from "@/server/services/employee-document.service";

type Context = RouteContext<"/api/employees/[id]/documents">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:view");
  const documents = await employeeDocumentService.list(ctx, routeId((await params).id, "Employee"));
  return NextResponse.json(documents.map(({ storageKey: _key, ...document }) => document));
});

/** Upload as multipart form data with a `file` field. */
export const POST = handle(async (request: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:edit");
  const employeeId = routeId((await params).id, "Employee");
  const file = await readUpload(request, MAX_DOCUMENT_BYTES, "Files must be 10 MB or smaller.");
  const { storageKey: _key, ...document } = await employeeDocumentService.upload(ctx, employeeId, file);
  return NextResponse.json(document, { status: 201 });
});
