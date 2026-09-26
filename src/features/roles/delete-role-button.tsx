"use client";

import { ConfirmButton } from "@/components/shared/confirm-button";
import { deleteRoleAction } from "@/server/actions/role.actions";

export function DeleteRoleButton({ roleId, roleName }: { roleId: string; roleName: string }) {
  return (
    <ConfirmButton
      label="Delete role"
      title={`Delete the role "${roleName}"?`}
      description="This cannot be undone. Roles that are still assigned to users can't be deleted."
      confirmLabel="Delete role"
      onConfirm={async () => {
        const result = await deleteRoleAction(roleId);
        // On success the action redirects to the roles list.
        if (!result.ok) throw new Error(result.error.message);
      }}
    />
  );
}
