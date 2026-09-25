import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { defaultSettings } from "@/lib/settings/registry";
import { settingsService } from "@/server/services/settings.service";
import { createCompanyWithOwner } from "./helpers";

describe("settingsService", () => {
  it("returns defaults until a value is saved", async () => {
    const ctx = await createCompanyWithOwner("Defaults Co");
    expect(await settingsService.getAll(ctx)).toEqual(defaultSettings());
    expect(await db.setting.count()).toBe(0);
  });

  it("validates, saves per company, stamps the actor and audits the change", async () => {
    const ctx = await createCompanyWithOwner("Settings Co");
    const other = await createCompanyWithOwner("Other Co");

    await settingsService.set(ctx, "general.dateFormat", "dd/MM/yyyy");
    expect(await settingsService.get(ctx, "general.dateFormat")).toBe("dd/MM/yyyy");
    expect(await settingsService.get(other, "general.dateFormat")).toBe("yyyy-MM-dd");

    const row = await db.setting.findUniqueOrThrow({
      where: { companyId_key: { companyId: ctx.companyId, key: "general.dateFormat" } },
    });
    expect(row).toMatchObject({ createdById: ctx.userId, updatedById: ctx.userId });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "setting.update" } });
    expect(audit).toMatchObject({
      companyId: ctx.companyId,
      actorId: ctx.userId,
      entityId: "general.dateFormat",
    });
    expect(audit.before).toEqual({ value: "yyyy-MM-dd" });
    expect(audit.after).toEqual({ value: "dd/MM/yyyy" });
  });

  it("rejects invalid values without saving them", async () => {
    const ctx = await createCompanyWithOwner("Strict Co");
    await expect(settingsService.set(ctx, "general.weekStartsOn", 9)).rejects.toBeInstanceOf(ValidationError);
    await expect(settingsService.set(ctx, "documents.invoiceNumberPrefix", "inv ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await db.setting.count()).toBe(0);
  });

  it("falls back to the default when a stored value no longer matches its schema", async () => {
    const ctx = await createCompanyWithOwner("Legacy Co");
    await db.setting.create({
      data: { companyId: ctx.companyId, key: "general.weekStartsOn", value: "monday" },
    });
    expect(await settingsService.get(ctx, "general.weekStartsOn")).toBe(1);
  });
});
