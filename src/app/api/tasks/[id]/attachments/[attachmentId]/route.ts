import { NextResponse } from "next/server";
import { fileDownload, handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { taskService } from "@/server/services/task.service";

type Context = RouteContext<"/api/tasks/[id]/attachments/[attachmentId]">;

/** Always a download (never rendered inline). */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:view");
  const { id, attachmentId } = await params;
  const { attachment, body } = await taskService.downloadAttachment(
    ctx,
    routeId(id, "Task"),
    routeId(attachmentId, "Attachment"),
  );
  return fileDownload(body, attachment.name, attachment.contentType);
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:edit");
  const { id, attachmentId } = await params;
  await taskService.removeAttachment(ctx, routeId(id, "Task"), routeId(attachmentId, "Attachment"));
  return new NextResponse(null, { status: 204 });
});
