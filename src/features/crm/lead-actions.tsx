"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { SelectInput } from "@/components/forms/select-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatusKey } from "@/config/crm";
import { cn } from "@/lib/utils";
import { convertLeadAction, setLeadStatusAction } from "@/server/actions/lead.actions";
import { optionsOf } from "./labels";

/** Pipeline progress for one lead, with a control to move it (when allowed). */
export function LeadStageControl({
  id,
  status,
  canEdit,
}: {
  id: string;
  status: LeadStatusKey;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const reached = LEAD_STATUSES.indexOf(status);

  function change(next: string) {
    const parsed = LEAD_STATUSES.find((value) => value === next);
    if (!parsed || parsed === status) return;
    startTransition(async () => {
      const result = await setLeadStatusAction({ id, status: parsed });
      if (result.ok) toast.success(`Moved to ${LEAD_STATUS_LABELS[parsed]}.`);
      else toast.error(result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-7 gap-1" aria-label="Pipeline stage">
        {LEAD_STATUSES.map((stage, index) => {
          const current = stage === status;
          const lost = status === "LOST";
          const done = !lost && index <= reached && stage !== "LOST";
          return (
            <li key={stage} aria-current={current ? "step" : undefined} className="min-w-0">
              <span
                className={cn(
                  "block h-1.5 rounded-full bg-muted",
                  done && "bg-primary",
                  current && lost && "bg-danger",
                  current && stage === "WON" && "bg-success",
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "mt-1 hidden truncate text-xs text-muted-foreground sm:block",
                  current && "font-medium text-foreground",
                )}
              >
                {LEAD_STATUS_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ol>
      {canEdit ? (
        <div className="flex items-center gap-2">
          <label htmlFor="lead-stage" className="text-sm text-muted-foreground">
            Stage
          </label>
          <SelectInput
            id="lead-stage"
            value={status}
            onValueChange={change}
            disabled={pending}
            options={optionsOf(LEAD_STATUSES, LEAD_STATUS_LABELS)}
          />
        </div>
      ) : (
        <p className="text-sm">
          Stage: <span className="font-medium">{LEAD_STATUS_LABELS[status]}</span>
        </p>
      )}
    </div>
  );
}

/** Creates a customer from the lead (marks it Won). Confirmation first, since it creates a record. */
export function ConvertLeadButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      tone="default"
      title="Convert to customer?"
      description={`A new customer is created from “${name}” with the lead's contact details, and the lead is marked as Won.`}
      confirmLabel="Convert"
      trigger={
        <Button type="button">
          <UserPlus aria-hidden="true" />
          Convert to customer
        </Button>
      }
      onConfirm={async () => {
        const result = await convertLeadAction(id);
        if (!result.ok) throw new Error(result.error.message);
        toast.success("Customer created from lead.");
        router.push(`/crm/customers/${result.data.customerId}`);
        router.refresh();
      }}
    />
  );
}
