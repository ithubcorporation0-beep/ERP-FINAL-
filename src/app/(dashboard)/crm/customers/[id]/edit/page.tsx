import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/crm";
import { CustomerForm } from "@/features/crm/customer-form";
import { authorizePage } from "@/lib/auth/page";
import { countryOptions } from "@/lib/intl";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { customerService } from "@/server/services/customer.service";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: PageProps<"/crm/customers/[id]/edit">) {
  const ctx = await authorizePage("customers:edit");
  if (!ctx) return <AccessDenied />;
  const customer = await orNotFound(customerService.get(ctx, recordIdOrNotFound((await params).id)));

  return (
    <>
      <PageHeader
        title={`Edit ${customer.name}`}
        description={`Customer ID ${formatRecordNumber("customer", customer.number)}`}
      />
      <Card className="shadow-xs">
        <CardContent>
          <CustomerForm
            customerId={customer.id}
            countries={countryOptions()}
            defaults={{
              name: customer.name,
              companyName: customer.companyName ?? "",
              email: customer.email ?? "",
              phone: customer.phone ?? "",
              whatsapp: customer.whatsapp ?? "",
              address: customer.address ?? "",
              city: customer.city ?? "",
              country: customer.country ?? "",
              taxId: customer.taxId ?? "",
              type: customer.type,
              status: customer.status,
              notes: customer.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
