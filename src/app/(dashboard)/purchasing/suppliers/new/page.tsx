import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EMPTY_SUPPLIER } from "@/features/purchasing/defaults";
import { SupplierForm } from "@/features/purchasing/supplier-form";
import { authorizePage } from "@/lib/auth/page";

export const metadata: Metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  if (!(await authorizePage("suppliers:create"))) return <AccessDenied />;
  return (
    <>
      <PageHeader title="New supplier" description="A Supplier ID is assigned automatically when you save." />
      <Card className="shadow-xs">
        <CardContent>
          <SupplierForm defaults={EMPTY_SUPPLIER} />
        </CardContent>
      </Card>
    </>
  );
}
