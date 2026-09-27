import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { invoiceListQuerySchema, salesDocumentSchema } from "@/lib/validation";
import { invoiceService } from "@/server/services/invoice.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("invoices:view");
  const query = invoiceListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await invoiceService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("invoices:create");
  const input = salesDocumentSchema.parse(await req.json());
  return NextResponse.json(await invoiceService.create(ctx, input), { status: 201 });
});
