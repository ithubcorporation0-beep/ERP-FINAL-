import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { supplierListQuerySchema, supplierSchema } from "@/lib/validation";
import { supplierService } from "@/server/services/supplier.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("suppliers:view");
  const query = supplierListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await supplierService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("suppliers:create");
  return NextResponse.json(await supplierService.create(ctx, supplierSchema.parse(await req.json())), {
    status: 201,
  });
});
