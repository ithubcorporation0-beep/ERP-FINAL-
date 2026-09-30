"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput } from "@/components/forms/select-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Modal } from "@/components/shared/modal";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SALARY_COMPONENT_KIND_LABELS,
  SALARY_COMPONENT_KINDS,
  type SalaryComponentKindKey,
} from "@/config/payroll";
import { FormStatus } from "@/features/auth/form-status";
import { DetailList } from "@/features/crm/detail-list";
import { optionsOf } from "@/features/crm/labels";
import { salaryComponentSchema, type SalaryComponentInput } from "@/lib/validation";
import {
  addSalaryComponentAction,
  removeSalaryComponentAction,
  updateSalaryComponentAction,
} from "@/server/actions/payroll.actions";

export interface StructureComponent {
  id: string;
  kind: SalaryComponentKindKey;
  name: string;
  /** Exact decimal string. */
  amount: string;
  /** Preformatted. */
  amountLabel: string;
  isActive: boolean;
}

interface SalaryStructurePanelProps {
  employeeId: string;
  components: StructureComponent[];
  /** Preformatted monthly figures. */
  summary: { basic: string; allowances: string; deductions: string; tax: string; net: string };
  canEdit: boolean;
}

/**
 * Recurring monthly allowances, deductions and tax on top of the basic salary. Payroll processing copies them onto
 * each month's payslip; bonus, overtime and advances are added per run.
 */
export function SalaryStructurePanel({
  employeeId,
  components,
  summary,
  canEdit,
}: SalaryStructurePanelProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState<StructureComponent | null>(null);

  return (
    <div className="space-y-4">
      <DetailList
        items={[
          { label: "Basic salary", value: summary.basic },
          { label: "Allowances", value: summary.allowances },
          { label: "Deductions", value: summary.deductions },
          { label: "Tax", value: summary.tax },
          { label: "Net before bonus, overtime and advances", value: <strong>{summary.net}</strong> },
        ]}
      />
      {components.length === 0 ? (
        <p className="text-sm text-muted-foreground">No allowances, deductions or tax set up.</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">Salary structure</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Monthly amount</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((component) => (
              <TableRow key={component.id}>
                <TableCell>{SALARY_COMPONENT_KIND_LABELS[component.kind]}</TableCell>
                <TableCell>
                  {component.name}
                  {component.isActive ? null : (
                    <StatusBadge tone="neutral" className="ml-2">
                      Inactive
                    </StatusBadge>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap" data-numeric>
                  {component.amountLabel}
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <div className="flex justify-end gap-1">
                      <ComponentDialog employeeId={employeeId} component={component} />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${component.name}`}
                        onClick={() => setRemoving(component)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {canEdit ? <ComponentDialog employeeId={employeeId} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title={`Remove ${removing?.name ?? ""}?`}
        description="It won't be included in future payrolls. Payrolls already processed keep it."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          const result = await removeSalaryComponentAction(employeeId, removing.id);
          if (!result.ok) throw new Error(result.error.message);
          toast.success("Component removed.");
          setRemoving(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function ComponentDialog({ employeeId, component }: { employeeId: string; component?: StructureComponent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults: SalaryComponentInput = component
    ? { kind: component.kind, name: component.name, amount: component.amount, isActive: component.isActive }
    : { kind: "ALLOWANCE", name: "", amount: "", isActive: true };
  const form = useForm<SalaryComponentInput>({
    resolver: zodResolver(salaryComponentSchema),
    defaultValues: defaults,
  });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SalaryComponentInput) {
    const result = component
      ? await updateSalaryComponentAction(employeeId, component.id, values)
      : await addSalaryComponentAction(employeeId, values);
    if (!result.ok) return applyActionError(form.setError, result, ["kind", "name", "amount"]);
    toast.success(component ? "Component updated." : "Component added.");
    setOpen(false);
    if (!component) form.reset(defaults);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(defaults);
      }}
      title={component ? `Edit ${component.name}` : "Add to salary structure"}
      description="A monthly amount copied onto every payslip from the next payroll processed."
      trigger={
        component ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${component.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm">
            <Plus aria-hidden="true" />
            Add allowance, deduction or tax
          </Button>
        )
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FieldGroup>
          <FormField
            control={form.control}
            name="kind"
            label="Type"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(SALARY_COMPONENT_KINDS, SALARY_COMPONENT_KIND_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="name"
            label="Name"
            required
            description="e.g. House rent allowance, Provident fund, Income tax."
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="amount"
            label="Monthly amount"
            required
            render={({ field, control }) => (
              <Input inputMode="decimal" placeholder="0.00" autoComplete="off" {...field} {...control} />
            )}
          />
          {component ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`component-active-${component.id}`}
                checked={isActive !== false}
                onCheckedChange={(value) => form.setValue("isActive", value === true)}
              />
              <Label htmlFor={`component-active-${component.id}`}>Active (included in payroll)</Label>
            </div>
          ) : null}
        </FieldGroup>
        <FormStatus tone="error" message={errors.root?.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
