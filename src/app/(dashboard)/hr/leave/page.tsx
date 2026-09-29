import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { LEAVE_STATUS_LABELS, LEAVE_STATUSES } from "@/config/hr";
import { leaveRow } from "@/features/hr/leave-rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { leaveListQuerySchema } from "@/lib/validation";
import { leaveService } from "@/server/services/leave.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: PageProps<"/hr/leave">) {
  const ctx = await authorizePage("leaves:view");
  if (!ctx) return <AccessDenied />;
  const query = leaveListQuerySchema.catch(leaveListQuerySchema.parse({})).parse(await searchParams);
  const [result, company] = await Promise.all([leaveService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "leaves:create");

  return (
    <>
      <PageHeader
        title="Leave"
        description={
          leaveService.seesAll(ctx)
            ? "Leave requests from the whole company. Approvers decide pending requests."
            : "Your leave requests and their approval status."
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hr/leave/new">
                <Plus aria-hidden="true" />
                Request leave
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((leave) => leaveRow(leave, company))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Leave requests",
          searchLabel: "Search leave requests",
          searchPlaceholder: "Search number, employee or reason…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: LEAVE_STATUSES.map((status) => ({
            value: status,
            label: LEAVE_STATUS_LABELS[status],
          })),
          columns: {
            code: "Request",
            reference: "Type",
            party: "Employee",
            date: "Dates",
            amount: "Working days",
          },
          empty: {
            icon: "leave",
            title: "No leave requests yet",
            description: "Requests appear here with their approval status.",
            ...(canCreate ? { createHref: "/hr/leave/new", createLabel: "Request leave" } : {}),
          },
        }}
      />
    </>
  );
}
