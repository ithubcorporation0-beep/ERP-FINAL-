import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/tenant";
import { customerSchema, idSchema } from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";

type Params = { params: Promise<{ id: string }> };

/** A malformed id can never match a record, so it is reported as "not found". */
async function customerId(params: Params["params"]): Promise<string> {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) throw new NotFoundError("Customer");
  return parsed.data;
}

export const GET = handle(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("customers", "read");
  return NextResponse.json(await customerService.get(ctx, await customerId(params)));
});

export const PATCH = handle(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("customers", "update");
  const id = await customerId(params);
  const input = customerSchema.partial().parse(await req.json());
  return NextResponse.json(await customerService.update(ctx, id, input));
});

export const DELETE = handle(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("customers", "delete");
  await customerService.remove(ctx, await customerId(params));
  return new NextResponse(null, { status: 204 });
});
