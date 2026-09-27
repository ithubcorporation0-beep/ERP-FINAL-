"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MessagesSquare, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput } from "@/components/forms/select-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMUNICATION_CHANNEL_LABELS,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTION_LABELS,
  COMMUNICATION_DIRECTIONS,
  type CommunicationChannelKey,
  type CommunicationDirectionKey,
} from "@/config/crm";
import { FormStatus } from "@/features/auth/form-status";
import { communicationFormSchema, type CommunicationFormInput } from "@/lib/validation";
import { addCommunicationAction, deleteCommunicationAction } from "@/server/actions/customer.actions";
import { CHANNEL_ICONS, optionsOf } from "./labels";

export interface CommunicationEntry {
  id: string;
  channel: CommunicationChannelKey;
  direction: CommunicationDirectionKey | null;
  subject: string | null;
  body: string;
  occurredAt: string;
  occurredAtLabel: string;
  authorName: string | null;
}

const FIELDS = ["channel", "direction", "subject", "body", "occurredAt"] as const;

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, in the browser's time zone. */
function nowForInput(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function CommunicationForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const form = useForm<CommunicationFormInput>({
    resolver: zodResolver(communicationFormSchema),
    defaultValues: { channel: "NOTE", direction: "", subject: "", body: "", occurredAt: nowForInput() },
  });
  const channel = useWatch({ control: form.control, name: "channel" });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: CommunicationFormInput) {
    const result = await addCommunicationAction(customerId, {
      ...values,
      direction: values.channel === "NOTE" ? "" : values.direction,
      occurredAt: new Date(values.occurredAt).toISOString(),
    });
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success(values.channel === "NOTE" ? "Note added." : "Communication logged.");
    form.reset({
      channel: values.channel,
      direction: values.direction,
      subject: "",
      body: "",
      occurredAt: nowForInput(),
    });
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          control={form.control}
          name="channel"
          label="Type"
          required
          render={({ field, control }) => (
            <SelectInput
              {...control}
              className="sm:w-full"
              value={field.value}
              onValueChange={field.onChange}
              options={optionsOf(COMMUNICATION_CHANNELS, COMMUNICATION_CHANNEL_LABELS)}
            />
          )}
        />
        {channel === "NOTE" ? null : (
          <FormField
            control={form.control}
            name="direction"
            label="Direction"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || undefined}
                onValueChange={field.onChange}
                options={optionsOf(COMMUNICATION_DIRECTIONS, COMMUNICATION_DIRECTION_LABELS)}
                placeholder="Inbound or outbound…"
              />
            )}
          />
        )}
        <FormField
          control={form.control}
          name="occurredAt"
          label="When"
          required
          render={({ field, control }) => (
            <Input type="datetime-local" max={nowForInput()} {...field} {...control} />
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="subject"
        label="Subject"
        render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
      />
      <FormField
        control={form.control}
        name="body"
        label={channel === "NOTE" ? "Note" : "What was discussed"}
        required
        render={({ field, control }) => <Textarea rows={3} {...field} {...control} />}
      />
      <FormStatus tone="error" message={errors.root?.message} />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {channel === "NOTE" ? "Add note" : "Log communication"}
      </Button>
    </form>
  );
}

interface CommunicationPanelProps {
  customerId: string;
  entries: CommunicationEntry[];
  total: number;
  canEdit: boolean;
}

export function CommunicationPanel({ customerId, entries, total, canEdit }: CommunicationPanelProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState<CommunicationEntry | null>(null);

  return (
    <div className="space-y-6">
      {canEdit ? <CommunicationForm customerId={customerId} /> : null}
      {entries.length === 0 ? (
        <EmptyState
          size="compact"
          icon={MessagesSquare}
          title="No communication yet"
          description={
            canEdit ? "Log calls, emails, WhatsApp messages, meetings and notes above." : undefined
          }
        />
      ) : (
        <ol className="space-y-3" aria-label="Communication log">
          {entries.map((entry) => {
            const Icon = CHANNEL_ICONS[entry.channel];
            return (
              <li key={entry.id} className="flex gap-3 rounded-lg border p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{COMMUNICATION_CHANNEL_LABELS[entry.channel]}</span>
                    {entry.direction ? (
                      <Badge variant="outline">{COMMUNICATION_DIRECTION_LABELS[entry.direction]}</Badge>
                    ) : null}
                    {entry.subject ? <span className="text-sm">· {entry.subject}</span> : null}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.authorName ?? "Unknown"} ·{" "}
                    <time dateTime={entry.occurredAt}>{entry.occurredAtLabel}</time>
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${COMMUNICATION_CHANNEL_LABELS[entry.channel].toLowerCase()} from ${entry.occurredAtLabel}`}
                    onClick={() => setRemoving(entry)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {total > entries.length ? (
        <p className="text-xs text-muted-foreground">
          Showing the latest {entries.length} of {total} entries.
        </p>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title="Delete this entry?"
        description="It will be removed from the communication log. The deletion is recorded in the history."
        confirmLabel="Delete entry"
        onConfirm={async () => {
          if (!removing) return;
          const result = await deleteCommunicationAction(customerId, removing.id);
          if (!result.ok) throw new Error(result.error.message);
          toast.success("Entry deleted.");
          setRemoving(null);
          router.refresh();
        }}
      />
    </div>
  );
}
