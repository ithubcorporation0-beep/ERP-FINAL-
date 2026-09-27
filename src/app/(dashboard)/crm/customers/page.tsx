import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatRecordNumber } from "@/config/crm";
import { CustomerList } from "@/features/crm/customer-list";
import { countryName, formatDate } from "@/lib/format";
import { authorizePage } from "@/lib/auth/page";
import { countryOptions } from "@/lib/intl";
import { can } from "@/lib/tenant";
import { customerListQuerySchema } from "@/lib/validation";
import { companyService } from "@/server/services/company.service";
import { customerService } from "@/server/services/customer.service";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/crm/customers">) {
  const ctx = await authorizePage("customers:view");
  if (!ctx) return <AccessDenied />;

  const query = customerListQuerySchema.catch(customerListQuerySchema.parse({})).parse(await searchParams);
  const [result, format] = await Promise.all([
    customerService.list(ctx, query),
    companyService.formatting(ctx),
  ]);
  const canCreate = can(ctx, "customers:create");

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you sell to, with their contact details, communication and documents."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/crm/customers/new">
                <Plus aria-hidden="true" />
                Add customer
              </Link>
            </Button>
          ) : undefined
        }
      />
      <CustomerList
        rows={result.items.map((customer) => ({
          id: customer.id,
          number: customer.number,
          code: formatRecordNumber("customer", customer.number),
          name: customer.name,
          companyName: customer.companyName,
          email: customer.email,
          phone: customer.phone,
          location:
            [customer.city, countryName(customer.country, format.locale)].filter(Boolean).join(", ") || null,
          type: customer.type,
          status: customer.status,
          createdAt: formatDate(customer.createdAt, format),
        }))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        sort={{ id: query.sort, desc: query.dir === "desc" }}
        countries={countryOptions()}
        canCreate={canCreate}
      />
    </>
  );
}
