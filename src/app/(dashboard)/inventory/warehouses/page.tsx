import type { Metadata } from "next";
import { Warehouse } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
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
import { DeleteSetupButton, WarehouseDialog } from "@/features/inventory/setup-dialogs";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { warehouseService } from "@/server/services/warehouse.service";

export const metadata: Metadata = { title: "Warehouses" };

export default async function WarehousesPage() {
  const ctx = await authorizePage("inventory:view");
  if (!ctx) return <AccessDenied />;
  const warehouses = await warehouseService.list(ctx);
  const canCreate = can(ctx, "inventory:create");
  const canEdit = can(ctx, "inventory:edit");
  const canDelete = can(ctx, "inventory:delete");

  return (
    <>
      <PageHeader
        title="Warehouses"
        description="Places where stock is kept. Stock is tracked per warehouse; transfers move it between them."
        actions={canCreate ? <WarehouseDialog /> : undefined}
      />
      <Card className="shadow-xs">
        <CardContent>
          {warehouses.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Warehouse}
              title="No warehouses yet"
              description={
                canCreate ? "Add at least one warehouse (e.g. Main store) before recording stock." : undefined
              }
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">Warehouses</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Stock movements</TableHead>
                  <TableHead className="w-40">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.map((warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell className="font-medium">
                      {warehouse.name}
                      {warehouse.isActive ? null : (
                        <StatusBadge tone="neutral" className="ml-2">
                          Inactive
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{warehouse.address ?? ""}</TableCell>
                    <TableCell className="text-right" data-numeric>
                      {warehouse._count.stockMovements}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canEdit ? (
                          <WarehouseDialog
                            warehouse={{
                              id: warehouse.id,
                              name: warehouse.name,
                              address: warehouse.address ?? "",
                              isActive: warehouse.isActive,
                            }}
                          />
                        ) : null}
                        {canDelete && warehouse._count.stockMovements === 0 ? (
                          <DeleteSetupButton kind="warehouse" id={warehouse.id} name={warehouse.name} />
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
