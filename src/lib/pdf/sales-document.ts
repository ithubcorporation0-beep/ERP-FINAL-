import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ACCENT, drawFooters, embedLogo, INK, MUTED, PAGE, wrapText, Writer } from "./writer";

export { safeText, wrapText } from "./writer";

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

/** Column layout of the items table: x offset from the margin, width, alignment. */
const COLUMNS = [
  { key: "description", label: "Description", width: 205, align: "left" },
  { key: "quantity", label: "Qty", width: 45, align: "right" },
  { key: "unitPrice", label: "Unit price", width: 75, align: "right" },
  { key: "discount", label: "Disc.", width: 40, align: "right" },
  { key: "tax", label: "Tax", width: 40, align: "right" },
  { key: "total", label: "Amount", width: 94.28, align: "right" },
] as const;

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

  drawFooters(doc, regular, data.footer);

  return doc.save();
}
