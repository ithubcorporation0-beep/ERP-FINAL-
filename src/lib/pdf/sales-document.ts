import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * Renders a quotation, sales order or invoice as an A4 PDF with pdf-lib (pure JavaScript, no browser needed).
 * All values arrive preformatted (money, dates in the company's locale), so the PDF shows exactly what the app
 * shows. The built-in Helvetica font covers Western European text; characters outside it are replaced by "?"
 * (a Unicode font can be embedded later — see docs/decisions.md, ADR-033).
 */

export interface PdfParty {
  name: string;
  lines: string[];
}

export interface SalesPdfData {
  /** "Invoice", "Quotation" or "Sales order". */
  title: string;
  code: string;
  /** e.g. "Paid", "Overdue". */
  status?: string;
  company: PdfParty;
  logo?: { bytes: Uint8Array; contentType: string } | null;
  customer: PdfParty;
  /** Label/value pairs under the title, e.g. Invoice date, Due date. */
  facts: Array<{ label: string; value: string }>;
  items: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    tax: string;
    total: string;
  }>;
  totals: Array<{ label: string; value: string; strong?: boolean }>;
  notes?: string | null;
  terms?: string | null;
  footer?: string;
}

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.4, 0.45, 0.53);
const LINE = rgb(0.86, 0.88, 0.91);
const ACCENT = rgb(0.15, 0.39, 0.92);

/** Column layout of the items table: x offset from the margin, width, alignment. */
const COLUMNS = [
  { key: "description", label: "Description", width: 205, align: "left" },
  { key: "quantity", label: "Qty", width: 45, align: "right" },
  { key: "unitPrice", label: "Unit price", width: 75, align: "right" },
  { key: "discount", label: "Disc.", width: 40, align: "right" },
  { key: "tax", label: "Tax", width: 40, align: "right" },
  { key: "total", label: "Amount", width: 94.28, align: "right" },
] as const;

class Writer {
  private page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  get current(): PDFPage {
    return this.page;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  /** Starts a new page when fewer than `height` points are left. */
  ensure(height: number): boolean {
    if (this.y - height >= PAGE.margin + 20) return false;
    this.newPage();
    return true;
  }

  text(
    value: string,
    x: number,
    options: { size?: number; font?: PDFFont; color?: typeof INK; align?: string; width?: number } = {},
  ) {
    const font = options.font ?? this.regular;
    const size = options.size ?? 9;
    const safe = safeText(font, value);
    const textWidth = font.widthOfTextAtSize(safe, size);
    const left = options.align === "right" && options.width !== undefined ? x + options.width - textWidth : x;
    this.page.drawText(safe, { x: left, y: this.y, size, font, color: options.color ?? INK });
  }

  rule(color = LINE) {
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.width - PAGE.margin, y: this.y },
      thickness: 0.75,
      color,
    });
  }
}

const supportedCharacters = new WeakMap<PDFFont, Set<number>>();

/** Replaces characters the font can't encode (standard fonts only cover WinAnsi) instead of failing. */
export function safeText(font: PDFFont, value: string): string {
  let supported = supportedCharacters.get(font);
  if (!supported) {
    supported = new Set(font.getCharacterSet());
    supportedCharacters.set(font, supported);
  }
  const set = supported;
  return Array.from(value.replace(/[\t\r]/g, " "))
    .map((char) => (set.has(char.codePointAt(0) ?? 0) ? char : "?"))
    .join("");
}

/** Splits text into lines that fit `width` at `size` (respecting existing line breaks). */
export function wrapText(font: PDFFont, value: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safeText(font, value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word longer than the column is cut into pieces.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

async function embedLogo(doc: PDFDocument, logo: SalesPdfData["logo"]): Promise<PDFImage | null> {
  if (!logo) return null;
  if (logo.contentType === "image/png") return doc.embedPng(logo.bytes);
  if (logo.contentType === "image/jpeg") return doc.embedJpg(logo.bytes);
  return null; // WebP can't be embedded by pdf-lib; the company name is shown instead.
}

function tableHeader(writer: Writer) {
  let x = PAGE.margin;
  for (const column of COLUMNS) {
    writer.text(column.label.toUpperCase(), x, {
      size: 7.5,
      font: writer.bold,
      color: MUTED,
      align: column.align,
      width: column.width - 6,
    });
    x += column.width;
  }
  writer.y -= 6;
  writer.rule();
  writer.y -= 14;
}

export async function renderSalesDocumentPdf(data: SalesPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${data.title} ${data.code}`);
  doc.setAuthor(data.company.name);
  doc.setCreator("IT Hub ERP");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new Writer(doc, regular, bold);
  const right = PAGE.width - PAGE.margin;

  // Header: logo or company name on the left, document title on the right.
  const logo = await embedLogo(doc, data.logo);
  const top = writer.y;
  if (logo) {
    const scaled = logo.scaleToFit(140, 48);
    writer.current.drawImage(logo, { x: PAGE.margin, y: top - scaled.height + 10, ...scaled });
    writer.y = top - scaled.height - 6;
  } else {
    writer.text(data.company.name, PAGE.margin, { size: 16, font: bold });
    writer.y -= 18;
  }
  const afterLogo = writer.y;
  writer.y = top;
  writer.text(data.title.toUpperCase(), right - 200, {
    size: 18,
    font: bold,
    color: ACCENT,
    align: "right",
    width: 200,
  });
  writer.y -= 16;
  writer.text(data.code, right - 200, { size: 11, font: bold, align: "right", width: 200 });
  if (data.status) {
    writer.y -= 13;
    writer.text(data.status, right - 200, { size: 9, color: MUTED, align: "right", width: 200 });
  }
  writer.y = Math.min(afterLogo, writer.y) - 18;

  // Parties.
  const partyTop = writer.y;
  const partyBlock = (label: string, party: PdfParty, x: number) => {
    writer.y = partyTop;
    writer.text(label.toUpperCase(), x, { size: 7.5, font: bold, color: MUTED });
    writer.y -= 13;
    writer.text(party.name, x, { size: 10, font: bold });
    for (const line of party.lines.filter(Boolean)) {
      for (const wrapped of wrapText(regular, line, 9, 230)) {
        writer.y -= 12;
        writer.text(wrapped, x, { color: MUTED });
      }
    }
    return writer.y;
  };
  const leftEnd = partyBlock("From", data.company, PAGE.margin);
  const rightEnd = partyBlock("Bill to", data.customer, PAGE.margin + 260);
  writer.y = Math.min(leftEnd, rightEnd) - 22;

  // Facts (dates etc.) in a row.
  let factX = PAGE.margin;
  for (const fact of data.facts) {
    writer.text(fact.label.toUpperCase(), factX, { size: 7.5, font: bold, color: MUTED });
    factX += 125;
  }
  writer.y -= 12;
  factX = PAGE.margin;
  for (const fact of data.facts) {
    writer.text(fact.value, factX, { size: 9.5 });
    factX += 125;
  }
  writer.y -= 26;

  // Items.
  tableHeader(writer);
  for (const item of data.items) {
    const descriptionLines = wrapText(regular, item.description, 9, COLUMNS[0].width - 8);
    const rowHeight = descriptionLines.length * 12 + 6;
    if (writer.ensure(rowHeight)) tableHeader(writer);
    const rowTop = writer.y;
    descriptionLines.forEach((line, index) => {
      writer.y = rowTop - index * 12;
      writer.text(line, PAGE.margin);
    });
    writer.y = rowTop;
    let x = PAGE.margin + COLUMNS[0].width;
    for (const column of COLUMNS.slice(1)) {
      writer.text(item[column.key], x, { align: "right", width: column.width - 6 });
      x += column.width;
    }
    writer.y = rowTop - rowHeight + 6;
    writer.rule();
    writer.y -= 14;
  }

  // Totals, right-aligned.
  writer.ensure(data.totals.length * 16 + 10);
  writer.y -= 4;
  for (const total of data.totals) {
    const font = total.strong ? bold : regular;
    const size = total.strong ? 11 : 9.5;
    writer.text(total.label, right - 240, {
      font,
      size,
      color: total.strong ? INK : MUTED,
      align: "right",
      width: 130,
    });
    writer.text(total.value, right - 110, { font, size, align: "right", width: 104 });
    writer.y -= total.strong ? 18 : 15;
  }

  // Notes and terms.
  for (const [label, body] of [
    ["Notes", data.notes],
    ["Terms and conditions", data.terms],
  ] as const) {
    if (!body) continue;
    const lines = wrapText(regular, body, 8.5, PAGE.width - PAGE.margin * 2);
    writer.ensure(28);
    writer.y -= 10;
    writer.text(label.toUpperCase(), PAGE.margin, { size: 7.5, font: bold, color: MUTED });
    for (const line of lines) {
      writer.y -= 11.5;
      writer.ensure(12);
      writer.text(line, PAGE.margin, { size: 8.5 });
    }
    writer.y -= 8;
  }

  // Footer with page numbers on every page.
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const footer = `${data.footer ? `${data.footer}  ·  ` : ""}Page ${index + 1} of ${pages.length}`;
    const safe = safeText(regular, footer);
    page.drawText(safe, {
      x: (PAGE.width - regular.widthOfTextAtSize(safe, 7.5)) / 2,
      y: PAGE.margin / 2,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  });

  return doc.save();
}
