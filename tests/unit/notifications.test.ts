import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPE_DEFINITIONS,
  NOTIFICATION_TYPES,
  isNotificationType,
} from "@/config/notifications";
import { actionGroup, actionGroupLabel, actionVerbLabel, csvCell } from "@/lib/audit/labels";
import {
  deadlineLabel,
  deadlineStage,
  dedupeKey,
  resolveChannels,
  retryDelayMinutes,
} from "@/lib/notifications";
import { isPermissionKey } from "@/lib/permissions";
import {
  auditLogQuerySchema,
  notificationListQuerySchema,
  notificationPreferencesSchema,
  notificationReadSchema,
} from "@/lib/validation";

describe("notification types", () => {
  it("defines every type, with real permissions and in-app on by default", () => {
    expect(Object.keys(NOTIFICATION_TYPE_DEFINITIONS).sort()).toEqual([...NOTIFICATION_TYPES].sort());
    for (const type of NOTIFICATION_TYPES) {
      const definition = NOTIFICATION_TYPE_DEFINITIONS[type];
      if (definition.permission) expect(isPermissionKey(definition.permission)).toBe(true);
      expect(definition.defaults.inApp).toBe(true);
      expect(definition.label.length).toBeGreaterThan(0);
    }
  });

  it("recognises only known types", () => {
    expect(isNotificationType("invoice.overdue")).toBe(true);
    expect(isNotificationType("invoice.deleted")).toBe(false);
    expect(isNotificationType("")).toBe(false);
  });
});

describe("notification rules", () => {
  it("uses the saved channels, otherwise the defaults", () => {
    const defaults = { inApp: true, email: false };
    expect(resolveChannels(defaults, undefined)).toEqual(defaults);
    expect(resolveChannels(defaults, { inApp: false, email: true })).toEqual({ inApp: false, email: true });
  });

  it("waits longer after every failed email, capped at 12 hours", () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMinutes)).toEqual([1, 5, 25, 125, 625]);
    expect(retryDelayMinutes(6)).toBe(720);
    expect(retryDelayMinutes(0)).toBe(1);
  });

  it("finds the deadline reminder stage", () => {
    const today = "2026-03-10";
    expect(deadlineStage("2026-03-14", today, 3)).toBeNull();
    expect(deadlineStage("2026-03-13", today, 3)).toBe("upcoming");
    expect(deadlineStage("2026-03-10", today, 1)).toBe("upcoming");
    expect(deadlineStage("2026-03-09", today, 1)).toBe("overdue");
    // Across a month end.
    expect(deadlineStage("2026-04-01", "2026-03-31", 1)).toBe("upcoming");
  });

  it("labels deadlines in plain words", () => {
    const today = "2026-03-10";
    expect(deadlineLabel("2026-03-10", today)).toBe("due today");
    expect(deadlineLabel("2026-03-11", today)).toBe("due tomorrow");
    expect(deadlineLabel("2026-03-13", today)).toBe("due in 3 days");
    expect(deadlineLabel("2026-03-09", today)).toBe("1 day overdue");
    expect(deadlineLabel("2026-03-05", today)).toBe("5 days overdue");
  });

  it("builds dedupe keys that change with the deadline and stage", () => {
    expect(dedupeKey("invoice.overdue", "abc")).toBe("invoice.overdue:abc");
    const upcoming = dedupeKey("task.deadline", "t1", "2026-03-10", "upcoming");
    expect(upcoming).not.toBe(dedupeKey("task.deadline", "t1", "2026-03-10", "overdue"));
    expect(upcoming).not.toBe(dedupeKey("task.deadline", "t1", "2026-03-12", "upcoming"));
  });
});

describe("notification validation", () => {
  it("ignores unknown filters", () => {
    expect(notificationListQuerySchema.parse({ status: "read", type: "nope" })).toMatchObject({
      status: undefined,
      type: undefined,
    });
    expect(notificationListQuerySchema.parse({ status: "unread", type: "task.assigned" })).toMatchObject({
      status: "unread",
      type: "task.assigned",
    });
  });

  it("accepts marking ids or everything, nothing else", () => {
    expect(notificationReadSchema.safeParse({ all: true }).success).toBe(true);
    expect(
      notificationReadSchema.safeParse({ ids: ["0190f1d2-7c3a-7b1e-9a4f-123456789abc"], read: false })
        .success,
    ).toBe(true);
    expect(notificationReadSchema.safeParse({ ids: [], read: true }).success).toBe(false);
    expect(notificationReadSchema.safeParse({ all: false }).success).toBe(false);
  });

  it("only accepts known types in preferences", () => {
    expect(
      notificationPreferencesSchema.safeParse({
        preferences: [{ type: "leave.requested", inApp: true, email: false }],
      }).success,
    ).toBe(true);
    expect(
      notificationPreferencesSchema.safeParse({
        preferences: [{ type: "sms.sent", inApp: true, email: true }],
      }).success,
    ).toBe(false);
  });
});

describe("audit log viewer", () => {
  it("drops malformed filters from a hand-edited URL", () => {
    expect(
      auditLogQuerySchema.parse({
        action: "invoice'; drop",
        entityType: "Invoice<script>",
        actorId: "x",
        from: "yesterday",
      }),
    ).toMatchObject({ action: undefined, entityType: undefined, actorId: undefined, from: undefined });
    expect(auditLogQuerySchema.parse({ action: "invoice.cancel", from: "2026-01-01" })).toMatchObject({
      action: "invoice.cancel",
      from: "2026-01-01",
    });
  });

  it("labels actions", () => {
    expect(actionGroup("invoice.payment_recorded")).toBe("invoice");
    expect(actionVerbLabel("invoice.payment_recorded")).toBe("Payment recorded");
    expect(actionVerbLabel("auth.login")).toBe("Login");
    expect(actionGroupLabel("auth")).toBe("Sign-in and account security");
    expect(actionGroupLabel("something_new")).toBe("Something new");
  });

  it("escapes CSV cells and defuses spreadsheet formulas", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "quoted", value')).toBe('"a ""quoted"", value"');
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(42)).toBe("42");
  });
});
