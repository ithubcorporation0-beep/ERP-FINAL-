"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormStatus } from "@/features/auth/form-status";
import { inviteMemberSchema, type InviteMemberInput } from "@/lib/validation";
import { inviteMemberAction } from "@/server/actions/member.actions";

export function InviteMemberDialog({ roles }: { roles: SelectOption[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { name: "", email: "", roleId: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: InviteMemberInput) {
    const result = await inviteMemberAction(values);
    if (!result.ok) return applyActionError(form.setError, result, ["name", "email", "roleId"]);
    if (result.data.emailSent) toast.success(`Invitation sent to ${values.email}.`);
    else toast.warning("The user was added, but the email could not be sent. Use “Resend invitation”.");
    form.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Invite a user"
      description="They'll receive an email to set their password. The link is valid for 7 days."
      trigger={
        <Button>
          <UserPlus aria-hidden="true" />
          Invite user
        </Button>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="invite-member" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Send invitation
          </Button>
        </>
      }
    >
      <form id="invite-member" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <FormField
            control={form.control}
            name="name"
            label="Full name"
            required
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="email"
            label="Email"
            required
            render={({ field, control }) => <Input type="email" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="roleId"
            label="Role"
            required
            description="You can only assign roles whose permissions you have yourself."
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={roles}
                placeholder="Choose a role"
              />
            )}
          />
          <FormStatus tone="error" message={errors.root?.message} />
        </FieldGroup>
      </form>
    </Modal>
  );
}
