import { NextResponse } from "next/server";
import { fileDownload, handle, readUpload, routeId } from "@/lib/api";
import { MAX_DOCUMENT_BYTES } from "@/lib/storage/documents";
import { requirePermission } from "@/lib/tenant";
import { expenseService } from "@/server/services/expense.service";

type Context = RouteContext<"/api/expenses/[id]/receipt">;

/** Always a download, never rendered inline. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  const receipt = await expenseService.receipt(ctx, routeId((await params).id, "Expense"));
  return fileDownload(receipt.body, receipt.name, receipt.contentType);
});

/** Multipart form data with a `file` field. */
export const POST = handle(async (request: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  const id = routeId((await params).id, "Expense");
  const file = await readUpload(request, MAX_DOCUMENT_BYTES, "Files must be 10 MB or smaller.");
  await expenseService.uploadReceipt(ctx, id, file);
  return new NextResponse(null, { status: 204 });
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  await expenseService.removeReceipt(ctx, routeId((await params).id, "Expense"));
  return new NextResponse(null, { status: 204 });
});
