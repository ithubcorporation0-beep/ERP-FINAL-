"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/features/auth/form-status";
import { changeMemberRoleAction } from "@/server/actions/member.actions";

interface ChangeRoleDialogProps {
  membershipId: string;
  memberName: string;
  currentRoleId: string;
  roles: SelectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeRoleDialog({
  membershipId,
  memberName,
  currentRoleId,
  roles,
  open,
  onOpenChange,
}: ChangeRoleDialogProps) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(currentRoleId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setPending(true);
    setError(undefined);
    const result = await changeMemberRoleAction({ membershipId, roleId });
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    toast.success(`${memberName}'s role was changed.`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Change role for ${memberName}`}
      description="The new permissions apply immediately."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || roleId === currentRoleId} aria-busy={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save role
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="member-role">Role</Label>
        <SelectInput
          id="member-role"
          className="sm:w-full"
          value={roleId}
          onValueChange={setRoleId}
          options={roles}
        />
        <FormStatus tone="error" message={error} />
      </div>
    </Modal>
  );
}
