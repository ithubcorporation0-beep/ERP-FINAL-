import type { Metadata } from "next";
import { Tags } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryDialog, DeleteSetupButton } from "@/features/inventory/setup-dialogs";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { productCategoryService } from "@/server/services/product-category.service";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const ctx = await authorizePage("products:view");
  if (!ctx) return <AccessDenied />;
  const categories = await productCategoryService.list(ctx);
  const canCreate = can(ctx, "products:create");
  const canEdit = can(ctx, "products:edit");
  const canDelete = can(ctx, "products:delete");

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group products for filtering and reports."
        actions={canCreate ? <CategoryDialog /> : undefined}
      />
      <Card className="shadow-xs">
        <CardContent>
          {categories.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Tags}
              title="No categories yet"
              description={
                canCreate ? "Add categories such as Cables, Laptops or Office supplies." : undefined
              }
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">Product categories</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="w-40">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-muted-foreground">{category.description ?? ""}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/inventory?categoryId=${category.id}`} className="hover:underline">
                        {category._count.products}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canEdit ? (
                          <CategoryDialog
                            category={{
                              id: category.id,
                              name: category.name,
                              description: category.description ?? "",
                            }}
                          />
                        ) : null}
                        {canDelete && category._count.products === 0 ? (
                          <DeleteSetupButton kind="category" id={category.id} name={category.name} />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
