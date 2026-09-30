import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatRecordNumber } from "@/config/records";
import { SupplierList } from "@/features/purchasing/supplier-list";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { supplierListQuerySchema } from "@/lib/validation";
import { supplierService } from "@/server/services/supplier.service";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: PageProps<"/purchasing/suppliers">) {
  const ctx = await authorizePage("suppliers:view");
  if (!ctx) return <AccessDenied />;
  const query = supplierListQuerySchema.catch(supplierListQuerySchema.parse({})).parse(await searchParams);
  const result = await supplierService.list(ctx, query);
  const canCreate = can(ctx, "suppliers:create");

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="The companies you buy from, with their products, purchases and payments."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/purchasing/suppliers/new">
                <Plus aria-hidden="true" />
                Add supplier
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SupplierList
        rows={result.items.map((supplier) => ({
          id: supplier.id,
          code: formatRecordNumber("supplier", supplier.number),
          name: supplier.name,
          companyName: supplier.companyName,
          phone: supplier.phone,
          email: supplier.email,
          taxId: supplier.taxId,
          products: supplier._count.products,
          isActive: supplier.isActive,
        }))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        canCreate={canCreate}
      />
    </>
  );
}
