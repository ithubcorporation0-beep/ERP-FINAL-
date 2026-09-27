"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/lib/action";
import { getCurrentSession } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/errors";
import { requirePermission } from "@/lib/tenant";
import { companyProfileSchema, idSchema, preferencesSchema } from "@/lib/validation";
import { companyContextService } from "@/server/services/company-context.service";
import { companyService } from "@/server/services/company.service";
import { settingsService } from "@/server/services/settings.service";

export async function updateCompanyProfileAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings:manage");
    await companyService.updateProfile(ctx, companyProfileSchema.parse(input));
    revalidatePath("/", "layout");
  });
}

export async function updatePreferencesAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings:manage");
    const values = preferencesSchema.parse(input);
    await settingsService.set(ctx, "general.dateFormat", values.dateFormat);
    await settingsService.set(ctx, "general.weekStartsOn", values.weekStartsOn);
    await settingsService.set(ctx, "documents.invoiceNumberPrefix", values.invoiceNumberPrefix);
    revalidatePath("/settings");
  });
}

/** Switches the session to another company the user belongs to, then opens that company's landing page. */
export async function switchCompanyAction(companyId: unknown): Promise<ActionResult<string>> {
  const result = await runAction(async () => {
    const session = await getCurrentSession();
    if (!session) throw new UnauthenticatedError();
    const { landing } = await companyContextService.switchCompany(
      session.user.id,
      session.sessionId,
      idSchema.parse(companyId),
    );
    return landing;
  });
  if (result.ok) {
    revalidatePath("/", "layout");
    redirect(result.data);
  }
  return result;
}
