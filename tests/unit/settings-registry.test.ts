import { describe, expect, it } from "vitest";
import {
  SETTING_DESCRIPTIONS,
  SETTING_KEYS,
  defaultSettings,
  isSettingKey,
  settingSchema,
} from "@/lib/settings/registry";

describe("settings registry", () => {
  it("every setting has a description and a default that passes its own schema", () => {
    const defaults = defaultSettings();
    for (const key of SETTING_KEYS) {
      expect(SETTING_DESCRIPTIONS[key]).toBeTruthy();
      expect(settingSchema(key).safeParse(defaults[key]).success, key).toBe(true);
    }
  });

  it("recognizes only registered keys", () => {
    expect(isSettingKey("general.dateFormat")).toBe(true);
    expect(isSettingKey("toString")).toBe(false);
    expect(isSettingKey("unknown.key")).toBe(false);
  });

  it("returns a fresh copy of the defaults", () => {
    const first = defaultSettings();
    first["general.weekStartsOn"] = 0;
    expect(defaultSettings()["general.weekStartsOn"]).toBe(1);
  });
});
