import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { salesDocumentSchema } from "@/lib/validation";
import { invoiceService } from "@/server/services/invoice.service";

type Context = RouteContext<"/api/invoices/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("invoices:view");
  return NextResponse.json(await invoiceService.get(ctx, routeId((await params).id, "Invoice")));
});

/** Replaces a draft invoice (header and lines). */
export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("invoices:edit");
  const id = routeId((await params).id, "Invoice");
  return NextResponse.json(await invoiceService.update(ctx, id, salesDocumentSchema.parse(await req.json())));
});

/** Drafts only — issued invoices are cancelled instead. */
export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("invoices:delete");
  await invoiceService.remove(ctx, routeId((await params).id, "Invoice"));
  return new NextResponse(null, { status: 204 });
});
