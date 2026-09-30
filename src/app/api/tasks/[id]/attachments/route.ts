import { NextResponse } from "next/server";
import { handle, readUpload, routeId } from "@/lib/api";
import { MAX_DOCUMENT_BYTES } from "@/lib/storage/documents";
import { requirePermission } from "@/lib/tenant";
import { taskService } from "@/server/services/task.service";

type Context = RouteContext<"/api/tasks/[id]/attachments">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:view");
  const attachments = await taskService.attachments(ctx, routeId((await params).id, "Task"));
  return NextResponse.json(attachments.map(({ storageKey: _key, ...attachment }) => attachment));
});

/** Multipart form data with a `file` field. */
export const POST = handle(async (request: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:edit");
  const id = routeId((await params).id, "Task");
  const file = await readUpload(request, MAX_DOCUMENT_BYTES, "Files must be 10 MB or smaller.");
  const { storageKey: _key, ...attachment } = await taskService.uploadAttachment(ctx, id, file);
  return NextResponse.json(attachment, { status: 201 });
});
