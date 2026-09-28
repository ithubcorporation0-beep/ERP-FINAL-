import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { attachmentHeader, MAX_DOCUMENT_BYTES } from "@/lib/storage/documents";
import { requirePermission } from "@/lib/tenant";
import { expenseService } from "@/server/services/expense.service";

type Context = RouteContext<"/api/expenses/[id]/receipt">;

/** Always a download, never rendered inline. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  const receipt = await expenseService.receipt(ctx, routeId((await params).id, "Expense"));
  return new NextResponse(new Uint8Array(receipt.body), {
    headers: {
      "Content-Type": receipt.contentType,
      "Content-Disposition": attachmentHeader(receipt.name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});

/** Multipart form data with a `file` field. */
export const POST = handle(async (request: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  const id = routeId((await params).id, "Expense");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES + 64 * 1024) {
    throw new ValidationError("Files must be 10 MB or smaller.");
  }
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) throw new ValidationError("Choose a file to upload.");
  await expenseService.uploadReceipt(ctx, id, {
    name: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  return new NextResponse(null, { status: 204 });
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  await expenseService.removeReceipt(ctx, routeId((await params).id, "Expense"));
  return new NextResponse(null, { status: 204 });
});
