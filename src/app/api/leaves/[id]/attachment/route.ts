import { NextResponse } from "next/server";
import { fileDownload, handle, readUpload, routeId } from "@/lib/api";
import { MAX_DOCUMENT_BYTES } from "@/lib/storage/documents";
import { requirePermission } from "@/lib/tenant";
import { leaveService } from "@/server/services/leave.service";

type Context = RouteContext<"/api/leaves/[id]/attachment">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("leaves:view");
  const file = await leaveService.attachment(ctx, routeId((await params).id, "Leave request"));
  return fileDownload(file.body, file.name, file.contentType);
});

/** Multipart form data with a `file` field (e.g. a medical certificate), while the request is pending. */
export const POST = handle(async (request: Request, { params }: Context) => {
  const ctx = await requirePermission("leaves:view");
  const id = routeId((await params).id, "Leave request");
  await leaveService.uploadAttachment(
    ctx,
    id,
    await readUpload(request, MAX_DOCUMENT_BYTES, "Files must be 10 MB or smaller."),
  );
  return new NextResponse(null, { status: 204 });
});
