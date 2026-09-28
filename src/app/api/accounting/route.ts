import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { accountingService } from "@/server/services/accounting.service";

/** The chart of accounts with each account's balance. */
export const GET = handle(async () => {
  const ctx = await requirePermission("accounting:view");
  return NextResponse.json(await accountingService.accounts(ctx));
});
