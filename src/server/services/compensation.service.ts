import "server-only";
import { decryptField, encryptField } from "@/lib/crypto/field-encryption";
import { db } from "@/lib/db";
import { money } from "@/lib/money";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { CompensationData } from "@/lib/validation";
import { compensationRepository } from "@/server/repositories/compensation.repository";
import { writeAuditLog } from "./audit.service";
import { employeeService } from "./employee.service";
import { salesContext } from "./sales-shared";

/**
 * Salary and bank details — restricted personal data (docs/hr.md → Salary and bank security):
 * - separate table, never loaded with the employee profile;
 * - `salaries:view` to see salary and masked bank details, `salaries:edit` to change them (HR Manager,
 *   Admin, Super Admin by default) — enforced here, not only by hiding UI;
 * - account number and IBAN encrypted at rest (AES-256-GCM, bound to company + employee + field); only the last 4
 *   characters are stored in clear for masking;
 * - showing the full numbers is an explicit, audited action; audit logs never contain the values
 *   (src/lib/audit/serialize.ts redacts them), only which fields changed.
 */

type Field = "accountNumber" | "iban";

function context(ctx: TenantContext, employeeId: string, field: Field): string {
  return `${ctx.companyId}:${employeeId}:${field}`;
}

function last4(value: string): string {
  return value.replace(/[\s-]/g, "").slice(-4);
}

function masked(value: string | null): string | null {
  return value ? `•••• ${value}` : null;
}

export const compensationService = {
  /** Salary and masked bank details. */
  async get(ctx: TenantContext, employeeId: string) {
    authorize(ctx, "salaries:view");
    await employeeService.get(ctx, employeeId);
    const [row, { currency }] = await Promise.all([
      compensationRepository.find(ctx.companyId, employeeId),
      salesContext(ctx),
    ]);
    return {
      salary: row?.salary ? money(row.salary) : null,
      currency: row?.currency ?? currency,
      bankName: row?.bankName ?? null,
      accountTitle: row?.accountTitle ?? null,
      accountNumber: masked(row?.accountNumberLast4 ?? null),
      iban: masked(row?.ibanLast4 ?? null),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy?.name ?? null,
    };
  },

  /** The full account number and IBAN, decrypted. Audited every time. */
  async reveal(ctx: TenantContext, employeeId: string) {
    authorize(ctx, "salaries:view");
    await employeeService.get(ctx, employeeId);
    const row = await compensationRepository.find(ctx.companyId, employeeId);
    const result = {
      accountNumber: row?.accountNumberCipher
        ? decryptField(row.accountNumberCipher, context(ctx, employeeId, "accountNumber"))
        : null,
      iban: row?.ibanCipher ? decryptField(row.ibanCipher, context(ctx, employeeId, "iban")) : null,
    };
    await writeAuditLog(ctx, {
      action: "employee.bank_reveal",
      entityType: "Employee",
      entityId: employeeId,
      metadata: { summary: "Full bank details shown" },
    });
    return result;
  },

  /** Saves salary and bank details. Empty account number / IBAN keep the stored value; `remove…` clears it. */
  async update(ctx: TenantContext, employeeId: string, input: CompensationData) {
    authorize(ctx, "salaries:edit");
    await employeeService.get(ctx, employeeId);
    const [before, { currency }] = await Promise.all([
      compensationRepository.find(ctx.companyId, employeeId),
      salesContext(ctx),
    ]);
    const salary = input.salary ? money(input.salary) : null;
    const changed: string[] = [];
    if ((before?.salary ? money(before.salary) : null) !== salary) changed.push("salary");
    if ((before?.bankName ?? null) !== (input.bankName || null)) changed.push("bank name");
    if ((before?.accountTitle ?? null) !== (input.accountTitle || null)) changed.push("account title");

    const secrets: {
      accountNumberCipher?: string | null;
      accountNumberLast4?: string | null;
      ibanCipher?: string | null;
      ibanLast4?: string | null;
    } = {};
    if (input.removeAccountNumber) {
      if (before?.accountNumberCipher) changed.push("account number");
      secrets.accountNumberCipher = null;
      secrets.accountNumberLast4 = null;
    } else if (input.accountNumber) {
      changed.push("account number");
      secrets.accountNumberCipher = encryptField(
        input.accountNumber,
        context(ctx, employeeId, "accountNumber"),
      );
      secrets.accountNumberLast4 = last4(input.accountNumber);
    }
    if (input.removeIban) {
      if (before?.ibanCipher) changed.push("IBAN");
      secrets.ibanCipher = null;
      secrets.ibanLast4 = null;
    } else if (input.iban) {
      changed.push("IBAN");
      secrets.ibanCipher = encryptField(input.iban, context(ctx, employeeId, "iban"));
      secrets.ibanLast4 = last4(input.iban);
    }
    if (changed.length === 0) return;

    await db.$transaction(async (tx) => {
      await compensationRepository.upsert(
        ctx.companyId,
        employeeId,
        {
          salary,
          currency: before?.currency ?? currency,
          bankName: input.bankName || null,
          accountTitle: input.accountTitle || null,
          ...secrets,
        },
        ctx.userId,
        tx,
      );
      // Only the names of the changed fields — never the values.
      await writeAuditLog(
        ctx,
        {
          action: "employee.compensation_update",
          entityType: "Employee",
          entityId: employeeId,
          metadata: { summary: `Changed: ${changed.join(", ")}` },
        },
        tx,
      );
    });
  },
};
