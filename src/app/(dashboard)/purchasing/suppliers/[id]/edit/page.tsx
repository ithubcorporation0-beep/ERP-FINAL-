import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { SupplierForm } from "@/features/purchasing/supplier-form";
import { authorizePage } from "@/lib/auth/page";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { supplierService } from "@/server/services/supplier.service";

export const metadata: Metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }: PageProps<"/purchasing/suppliers/[id]/edit">) {
  const ctx = await authorizePage("suppliers:edit");
  if (!ctx) return <AccessDenied />;
  const supplier = await orNotFound(supplierService.get(ctx, recordIdOrNotFound((await params).id)));
  return (
    <>
      <PageHeader
        title={`Edit ${supplier.name}`}
        description={`Supplier ID ${formatRecordNumber("supplier", supplier.number)}`}
      />
      <Card className="shadow-xs">
        <CardContent>
          <SupplierForm
            supplierId={supplier.id}
            defaults={{
              name: supplier.name,
              companyName: supplier.companyName ?? "",
              phone: supplier.phone ?? "",
              email: supplier.email ?? "",
              address: supplier.address ?? "",
              taxId: supplier.taxId ?? "",
              notes: supplier.notes ?? "",
              isActive: supplier.isActive,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
