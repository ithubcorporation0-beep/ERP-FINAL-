import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { customerSchema } from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";

type Params = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("customers", "read");
  return NextResponse.json(await customerService.get(ctx, (await params).id));
});

export const PATCH = handle(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("customers", "update");
  const input = customerSchema.partial().parse(await req.json());
  return NextResponse.json(await customerService.update(ctx, (await params).id, input));
});

export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("customers", "delete");
  await customerService.remove(ctx, (await params).id);
  return new NextResponse(null, { status: 204 });
});
