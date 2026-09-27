import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { customerSchema } from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";

type Context = RouteContext<"/api/customers/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("customers:view");
  return NextResponse.json(await customerService.get(ctx, routeId((await params).id, "Customer")));
});

export const PATCH = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("customers:edit");
  const id = routeId((await params).id, "Customer");
  const input = customerSchema.partial().parse(await req.json());
  return NextResponse.json(await customerService.update(ctx, id, input));
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("customers:delete");
  await customerService.remove(ctx, routeId((await params).id, "Customer"));
  return new NextResponse(null, { status: 204 });
});
