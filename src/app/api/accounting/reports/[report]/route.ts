import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/tenant";
import { reportQuerySchema } from "@/lib/validation";
import { financialReportService } from "@/server/services/financial-report.service";

type Context = RouteContext<"/api/accounting/reports/[report]">;

/** A financial report as JSON (the same figures as the report pages). */
export const GET = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("accounting:view");
  const { range, asOf } = reportQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  switch ((await params).report) {
    case "profit-and-loss":
      return NextResponse.json(await financialReportService.profitAndLoss(ctx, range));
    case "balance-sheet":
      return NextResponse.json(await financialReportService.balanceSheet(ctx, asOf));
    case "cash-flow":
      return NextResponse.json(await financialReportService.cashFlow(ctx, range));
    case "accounts-receivable":
      return NextResponse.json(await financialReportService.receivables(ctx));
    case "accounts-payable":
      return NextResponse.json(await financialReportService.payables(ctx));
    case "expenses":
      return NextResponse.json(await financialReportService.expenses(ctx, range));
    case "revenue":
      return NextResponse.json(await financialReportService.revenue(ctx, range));
    default:
      throw new NotFoundError("Report");
  }
});
