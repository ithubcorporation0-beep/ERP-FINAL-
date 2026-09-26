"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ACTION_LABELS, PERMISSION_GROUPS, type Action } from "@/lib/permissions";

const ACTION_ORDER: Action[] = ["view", "create", "edit", "delete", "export", "approve", "reject", "manage"];

interface PermissionMatrixProps {
  selected: ReadonlySet<string>;
  /** Permissions the editor may grant (their own); others are shown but disabled. */
  grantable: ReadonlySet<string>;
  onChange?: (next: Set<string>) => void;
  readOnly?: boolean;
}

/** Modules × actions grid. Only actions that exist for a module get a checkbox. */
export function PermissionMatrix({ selected, grantable, onChange, readOnly }: PermissionMatrixProps) {
  function toggle(keys: string[], on: boolean) {
    if (!onChange) return;
    const next = new Set(selected);
    for (const key of keys) {
      if (!grantable.has(key)) continue;
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table className="w-full text-sm">
        <caption className="sr-only">Permissions by module</caption>
        <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">
              Module
            </th>
            {ACTION_ORDER.map((action) => (
              <th key={action} scope="col" className="px-2 py-2.5 text-center font-medium">
                {ACTION_LABELS[action]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_GROUPS.map((group) => {
            const keys = group.permissions.map((permission) => permission.key);
            const all = keys.every((key) => selected.has(key));
            const some = keys.some((key) => selected.has(key));
            const rowGrantable = keys.some((key) => grantable.has(key));
            return (
              <tr key={group.module} className="border-t">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  <label className="flex items-center gap-2">
                    {readOnly ? null : (
                      <Checkbox
                        checked={all ? true : some ? "indeterminate" : false}
                        disabled={!rowGrantable}
                        onCheckedChange={(value) => toggle(keys, value === true)}
                        aria-label={`All ${group.label} permissions`}
                      />
                    )}
                    {group.label}
                  </label>
                </th>
                {ACTION_ORDER.map((action) => {
                  const permission = group.permissions.find((candidate) => candidate.action === action);
                  if (!permission) return <td key={action} aria-hidden="true" />;
                  const checked = selected.has(permission.key);
                  return (
                    <td key={action} className="px-2 py-2 text-center">
                      {readOnly ? (
                        <span className={checked ? "text-success" : "text-muted-foreground/50"}>
                          {checked ? "✓" : "—"}
                          <span className="sr-only">
                            {permission.description}: {checked ? "granted" : "not granted"}
                          </span>
                        </span>
                      ) : (
                        <Checkbox
                          checked={checked}
                          disabled={!grantable.has(permission.key)}
                          onCheckedChange={(value) => toggle([permission.key], value === true)}
                          aria-label={permission.description}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
