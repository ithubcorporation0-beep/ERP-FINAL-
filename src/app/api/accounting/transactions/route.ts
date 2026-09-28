import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { journalEntrySchema, journalListQuerySchema } from "@/lib/validation";
import { accountingService } from "@/server/services/accounting.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("accounting:view");
  const query = journalListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await accountingService.transactions(ctx, query));
});

/** A manual, balanced transaction. */
export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("accounting:create");
  const input = journalEntrySchema.parse(await req.json());
  return NextResponse.json(await accountingService.createTransaction(ctx, input), { status: 201 });
});
