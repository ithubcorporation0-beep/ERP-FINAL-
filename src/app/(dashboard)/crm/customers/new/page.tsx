import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerForm, EMPTY_CUSTOMER } from "@/features/crm/customer-form";
import { authorizePage } from "@/lib/auth/page";
import { countryOptions } from "@/lib/intl";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  const ctx = await authorizePage("customers:create");
  if (!ctx) return <AccessDenied />;
  return (
    <>
      <PageHeader title="New customer" description="A Customer ID is assigned automatically when you save." />
      <Card className="shadow-xs">
        <CardContent>
          <CustomerForm defaults={EMPTY_CUSTOMER} countries={countryOptions()} />
        </CardContent>
      </Card>
    </>
  );
}
