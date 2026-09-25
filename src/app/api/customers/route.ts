import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { customerSchema, paginationSchema } from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("customers", "read");
  const query = paginationSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await customerService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("customers", "create");
  const input = customerSchema.parse(await req.json());
  return NextResponse.json(await customerService.create(ctx, input), { status: 201 });
});
