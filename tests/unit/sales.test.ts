import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { formatInvoiceCode, formatRecordNumber, parseRecordNumber } from "@/config/records";
import {
  INVOICE_STATUSES,
  invoiceDisplayStatus,
  PAYMENT_METHODS,
  QUOTATION_STATUSES,
  quotationDisplayStatus,
} from "@/config/sales";
import { InvoiceStatus, PaymentMethod, QuotationStatus } from "@/generated/prisma/enums";
import { addDays, dateOnlyToDate, dateToDateOnly } from "@/lib/date-range";
import { formatMoney } from "@/lib/format";
import { renderSalesDocumentPdf, safeText, wrapText } from "@/lib/pdf/sales-document";
import { whatsappNumber, whatsappShareUrl } from "@/lib/sharing/whatsapp";
import { lineItemSchema, paymentSchema } from "@/lib/validation";

const sorted = (values: readonly string[]) => [...values].sort();

describe("sales vocabulary", () => {
  it("matches the database enums", () => {
    expect(sorted(QUOTATION_STATUSES)).toEqual(sorted(Object.values(QuotationStatus)));
    expect(sorted(INVOICE_STATUSES)).toEqual(sorted(Object.values(InvoiceStatus)));
    expect(sorted(PAYMENT_METHODS)).toEqual(sorted(Object.values(PaymentMethod)));
  });

  it("formats document numbers", () => {
    expect(formatRecordNumber("quotation", 7)).toBe("QUO-0007");
    expect(formatRecordNumber("order", 12)).toBe("SO-0012");
    expect(formatRecordNumber("payment", 1)).toBe("PAY-0001");
    expect(parseRecordNumber("order", "so-12")).toBe(12);
    expect(formatInvoiceCode("INV-", 42)).toBe("INV-0042");
    expect(formatInvoiceCode("AE/2026/", 12345)).toBe("AE/2026/12345");
  });

  it("derives Overdue and Expired from dates, never for closed documents", () => {
    expect(invoiceDisplayStatus("SENT", "2026-09-01", "2026-09-02")).toBe("OVERDUE");
    expect(invoiceDisplayStatus("PARTIALLY_PAID", "2026-09-01", "2026-09-02")).toBe("OVERDUE");
    expect(invoiceDisplayStatus("SENT", "2026-09-02", "2026-09-02")).toBe("SENT"); // due today is not overdue
    expect(invoiceDisplayStatus("PAID", "2020-01-01", "2026-09-02")).toBe("PAID");
    expect(invoiceDisplayStatus("DRAFT", "2020-01-01", "2026-09-02")).toBe("DRAFT");
    expect(quotationDisplayStatus("SENT", "2026-09-01", "2026-09-02")).toBe("EXPIRED");
    expect(quotationDisplayStatus("CONFIRMED", "2026-09-01", "2026-09-02")).toBe("CONFIRMED");
  });

  it("handles calendar dates without time-zone drift", () => {
    expect(dateToDateOnly(dateOnlyToDate("2026-02-28"))).toBe("2026-02-28");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 30)).toBe("2027-01-30");
  });
});

describe("sales validation", () => {
  it("accepts exact decimal strings and rejects floats in disguise", () => {
    expect(
      lineItemSchema.safeParse({
        description: "A",
        quantity: "2.5",
        unitPrice: "10.99",
        discountPercent: "0",
        taxRate: "5",
      }).success,
    ).toBe(true);
    for (const bad of [
      { quantity: "-1" },
      { quantity: "0.000" },
      { unitPrice: "1e2" },
      { unitPrice: "10.999" },
      { discountPercent: "100.01" },
      { taxRate: "abc" },
    ]) {
      const line = {
        description: "A",
        quantity: "1",
        unitPrice: "1",
        discountPercent: "0",
        taxRate: "0",
        ...bad,
      };
      expect(lineItemSchema.safeParse(line).success, JSON.stringify(bad)).toBe(false);
    }
    const payment = { invoiceId: crypto.randomUUID(), method: "CASH", paymentDate: "2026-09-01" };
    expect(paymentSchema.safeParse({ ...payment, amount: "0.00" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...payment, amount: "0.01" }).success).toBe(true);
    expect(paymentSchema.safeParse({ ...payment, amount: "10", method: "BITCOIN" }).success).toBe(false);
  });

  it("formats money from the exact string", () => {
    expect(formatMoney("1234567890123456.78", { locale: "en-US", currency: "USD" })).toBe(
      "$1,234,567,890,123,456.78",
    );
    expect(formatMoney("0.10", { locale: "en-US", currency: "AED" })).toBe("AED\u00a00.10");
    expect(() => formatMoney("1e5", { locale: "en-US", currency: "USD" })).toThrow();
  });
});

describe("WhatsApp sharing", () => {
  it("builds click-to-chat links with the international number", () => {
    expect(whatsappNumber("+971 50 123 4567")).toBe("971501234567");
    expect(whatsappNumber("00971-50-123-4567")).toBe("971501234567");
    expect(whatsappNumber("12")).toBeNull();
    expect(whatsappShareUrl({ phone: "+971 50 123 4567", text: "Invoice INV-0001 & more" })).toBe(
      "https://wa.me/971501234567?text=Invoice%20INV-0001%20%26%20more",
    );
    expect(whatsappShareUrl({ phone: null, text: "Hi" })).toBe("https://wa.me/?text=Hi");
  });
});

describe("PDF text", () => {
  it("replaces characters the standard font can't draw and wraps long text", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(safeText(font, "Müller – 5 €")).toBe("Müller – 5 €");
    expect(safeText(font, "محمد 王")).toBe("???? ?");
    const lines = wrapText(font, "word ".repeat(60) + "x".repeat(200), 9, 200);
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 9)).toBeLessThanOrEqual(200);
  });

  it("renders a document", async () => {
    const bytes = await renderSalesDocumentPdf({
      title: "Invoice",
      code: "INV-0001",
      status: "Sent",
      company: { name: "IT Hub", lines: ["Dubai"] },
      customer: { name: "Buyer", lines: [] },
      facts: [{ label: "Due date", value: "Oct 1, 2026" }],
      items: [
        {
          description: "Work",
          quantity: "1",
          unitPrice: "$10.00",
          discount: "—",
          tax: "5%",
          total: "$10.50",
        },
      ],
      totals: [{ label: "Total", value: "$10.50", strong: true }],
      notes: "Thanks",
      terms: null,
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Invoice INV-0001");
  });
});
