import { describe, expect, it } from "vitest";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  formatRecordNumber,
  LEAD_SOURCES,
  LEAD_STATUSES,
  parseRecordNumber,
} from "@/config/crm";
import {
  CommunicationChannel,
  CommunicationDirection,
  CustomerStatus,
  CustomerType,
  LeadSource,
  LeadStatus,
} from "@/generated/prisma/enums";
import { attachmentHeader, cleanFileName, detectDocumentType } from "@/lib/storage/documents";
import { communicationSchema, customerListQuerySchema, customerSchema, leadSchema } from "@/lib/validation";

const sorted = (values: readonly string[]) => [...values].sort();

describe("CRM vocabulary", () => {
  it("matches the database enums exactly", () => {
    expect(sorted(CUSTOMER_TYPES)).toEqual(sorted(Object.values(CustomerType)));
    expect(sorted(CUSTOMER_STATUSES)).toEqual(sorted(Object.values(CustomerStatus)));
    expect(sorted(LEAD_STATUSES)).toEqual(sorted(Object.values(LeadStatus)));
    expect(sorted(LEAD_SOURCES)).toEqual(sorted(Object.values(LeadSource)));
    expect(sorted(COMMUNICATION_CHANNELS)).toEqual(sorted(Object.values(CommunicationChannel)));
    expect(sorted(COMMUNICATION_DIRECTIONS)).toEqual(sorted(Object.values(CommunicationDirection)));
  });

  it("formats and parses record numbers", () => {
    expect(formatRecordNumber("customer", 7)).toBe("CUS-0007");
    expect(formatRecordNumber("lead", 12345)).toBe("LEAD-12345");
    expect(parseRecordNumber("customer", "CUS-0007")).toBe(7);
    expect(parseRecordNumber("customer", "cus7")).toBe(7);
    expect(parseRecordNumber("customer", " 0042 ")).toBe(42);
    expect(parseRecordNumber("customer", "LEAD-0007")).toBeUndefined();
    expect(parseRecordNumber("lead", "Acme")).toBeUndefined();
  });
});

describe("CRM validation", () => {
  it("normalises customers and rejects bad input", () => {
    expect(customerSchema.parse({ name: "  Ada  ", email: "ADA@X.TEST" })).toEqual({
      name: "Ada",
      email: "ada@x.test",
    });
    for (const bad of [
      { name: "" },
      { name: "A", email: "nope" },
      { name: "A", phone: "call me" },
      { name: "A", country: "ZZ" },
      { name: "A", type: "ALIEN" },
      { name: "A", notes: "x".repeat(5001) },
    ]) {
      expect(customerSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("ignores unknown list filters instead of failing", () => {
    expect(customerListQuerySchema.parse({ status: "WHATEVER", sort: "hack", country: "ZZ" })).toMatchObject({
      status: undefined,
      country: undefined,
      sort: "createdAt",
      dir: "desc",
      page: 1,
    });
  });

  it("validates lead money and dates as exact strings", () => {
    expect(
      leadSchema.parse({ name: "L", expectedValue: "1500.50", followUpDate: "2026-10-01" }),
    ).toMatchObject({
      expectedValue: "1500.50",
      followUpDate: "2026-10-01",
    });
    for (const expectedValue of ["-5", "1.005", "1e3", "12,50"]) {
      expect(leadSchema.safeParse({ name: "L", expectedValue }).success, expectedValue).toBe(false);
    }
    expect(leadSchema.safeParse({ name: "L", followUpDate: "2026-02-30" }).success).toBe(false);
    expect(leadSchema.safeParse({ name: "L", assignedToId: "not-a-uuid" }).success).toBe(false);
  });

  it("needs a direction for calls and messages but not for notes; no future dates", () => {
    expect(communicationSchema.safeParse({ channel: "NOTE", body: "x" }).success).toBe(true);
    expect(communicationSchema.safeParse({ channel: "CALL", body: "x" }).success).toBe(false);
    expect(communicationSchema.safeParse({ channel: "CALL", direction: "INBOUND", body: "x" }).success).toBe(
      true,
    );
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(communicationSchema.safeParse({ channel: "NOTE", body: "x", occurredAt: future }).success).toBe(
      false,
    );
  });
});

describe("document uploads", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("recognises allowed types by content, not by name", () => {
    expect(detectDocumentType(bytes("%PDF-1.7 ..."), "x.bin")).toEqual({
      contentType: "application/pdf",
      extension: "pdf",
    });
    expect(
      detectDocumentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "a.pdf"),
    ).toMatchObject({
      contentType: "image/png",
    });
    expect(detectDocumentType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]), "sheet.xlsx")).toMatchObject({
      extension: "xlsx",
    });
    expect(detectDocumentType(bytes("a,b\n1,2\n"), "data.csv")).toEqual({
      contentType: "text/csv",
      extension: "csv",
    });
  });

  it("refuses scripts, disguised files and unknown binaries", () => {
    expect(detectDocumentType(bytes("<html><script>alert(1)</script>"), "page.pdf")).toBeNull();
    expect(detectDocumentType(bytes("<svg onload=alert(1)>"), "logo.svg")).toBeNull();
    expect(detectDocumentType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "archive.zip")).toBeNull();
    expect(detectDocumentType(new Uint8Array([0x00, 0xff, 0x00]), "notes.txt")).toBeNull();
    expect(detectDocumentType(new Uint8Array([0xc3, 0x28]), "bad-utf8.txt")).toBeNull();
  });

  it("cleans file names and encodes download headers", () => {
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName('C:\\temp\\bad"<name>.pdf')).toBe("badname.pdf");
    expect(cleanFileName("")).toBe("document");
    expect(cleanFileName(`${"a".repeat(200)}.pdf`)).toHaveLength(150);
    expect(cleanFileName(`${"a".repeat(200)}.pdf`).endsWith(".pdf")).toBe(true);
    expect(attachmentHeader("Vertrag März.pdf")).toBe(
      "attachment; filename=\"Vertrag M_rz.pdf\"; filename*=UTF-8''Vertrag%20M%C3%A4rz.pdf",
    );
  });
});
