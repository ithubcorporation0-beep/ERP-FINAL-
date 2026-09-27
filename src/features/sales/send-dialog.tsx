"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import type { ActionResult } from "@/lib/action";
import { sendDocumentSchema, type SendDocumentInput } from "@/lib/validation";

interface SendDialogProps {
  id: string;
  /** e.g. "invoice INV-0001". */
  documentLabel: string;
  defaultTo: string;
  action: (input: SendDocumentInput) => Promise<ActionResult>;
}

/** Emails a document (PDF attached) to the customer or another address. */
export function SendDialog({ id, documentLabel, defaultTo, action }: SendDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<SendDocumentInput>({
    resolver: zodResolver(sendDocumentSchema),
    defaultValues: { id, to: defaultTo, message: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SendDocumentInput) {
    const result = await action(values);
    if (!result.ok) return applyActionError(form.setError, result, ["to", "message"]);
    toast.success(`Sent ${documentLabel} to ${values.to}.`);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Mail aria-hidden="true" />
          Send by email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Send {documentLabel}</DialogTitle>
            <DialogDescription>The PDF is attached to the email.</DialogDescription>
          </DialogHeader>
          <FormField
            control={form.control}
            name="to"
            label="To"
            required
            render={({ field, control }) => (
              <Input type="email" autoComplete="email" {...field} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="message"
            label="Message"
            description="Optional, added above the standard text."
            render={({ field, control }) => (
              <Textarea rows={3} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          <FormStatus tone="error" message={errors.root?.message} />
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
