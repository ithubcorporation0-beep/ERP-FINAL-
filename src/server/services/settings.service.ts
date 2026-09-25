import { db } from "@/lib/db";
import { ValidationError, zodFieldErrors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  defaultSettings,
  isSettingKey,
  settingSchema,
  type SettingKey,
  type SettingValue,
  type SettingValues,
} from "@/lib/settings/registry";
import type { TenantContext } from "@/lib/tenant";
import { settingRepository } from "@/server/repositories/setting.repository";
import { writeAuditLog } from "./audit.service";

function parseStored<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> | undefined {
  const result = settingSchema(key).safeParse(raw);
  if (result.success) return result.data;
  // A stored value no longer matches its schema (e.g. after a code change): keep working with the default.
  logger.warn("Ignoring invalid stored setting; using default", { key });
  return undefined;
}

export const settingsService = {
  /** All settings for the company: stored values over defaults. */
  async getAll(ctx: TenantContext): Promise<SettingValues> {
    const values = defaultSettings();
    for (const row of await settingRepository.findAll(ctx.companyId)) {
      if (!isSettingKey(row.key)) continue;
      assign(values, row.key, row.value);
    }
    return values;
  },

  async get<K extends SettingKey>(ctx: TenantContext, key: K): Promise<SettingValue<K>> {
    const row = await settingRepository.find(ctx.companyId, key);
    return (row && parseStored(key, row.value)) ?? defaultSettings()[key];
  },

  /** Validates, saves and audits one setting. Callers must check `settings:update` first. */
  async set<K extends SettingKey>(ctx: TenantContext, key: K, value: unknown): Promise<SettingValue<K>> {
    const parsed = settingSchema(key).safeParse(value);
    if (!parsed.success) {
      throw new ValidationError(`Invalid value for ${key}.`, zodFieldErrors(parsed.error));
    }
    const before = await this.get(ctx, key);
    await db.$transaction(async (tx) => {
      await settingRepository.upsert(ctx.companyId, key, parsed.data, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        {
          action: "setting.update",
          entityType: "Setting",
          entityId: key,
          before: { value: before },
          after: { value: parsed.data },
        },
        tx,
      );
    });
    return parsed.data;
  },
};

function assign<K extends SettingKey>(values: SettingValues, key: K, raw: unknown) {
  const parsed = parseStored(key, raw);
  if (parsed !== undefined) values[key] = parsed;
}
