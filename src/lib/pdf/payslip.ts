import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ACCENT, drawFooters, embedLogo, INK, MUTED, PAGE, wrapText, Writer } from "./writer";

/**
 * A salary slip (payslip) as an A4 PDF. Values arrive preformatted (company locale and currency), so the slip
 * shows exactly the figures stored on the payroll item.
 */

export interface PayslipPdfData {
  company: { name: string; lines: string[] };
  logo?: { bytes: Uint8Array; contentType: string } | null;
  /** e.g. "PRL-0003 · September 2026". */
  reference: string;
  status: string;
  employee: { name: string; lines: string[] };
  facts: Array<{ label: string; value: string }>;
  earnings: Array<{ label: string; amount: string }>;
  deductions: Array<{ label: string; amount: string }>;
  gross: string;
  totalDeductions: string;
  net: string;
  note?: string | null;
  footer?: string;
}

const COLUMN = (PAGE.width - PAGE.margin * 2 - 24) / 2;

export async function renderPayslipPdf(data: PayslipPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Salary slip ${data.reference} — ${data.employee.name}`);
  doc.setAuthor(data.company.name);
  doc.setCreator("IT Hub ERP");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new Writer(doc, regular, bold);
  const right = PAGE.width - PAGE.margin;

  // Header: logo or company name, title on the right.
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
  writer.text("SALARY SLIP", right - 220, {
    size: 18,
    font: bold,
    color: ACCENT,
    align: "right",
    width: 220,
  });
  writer.y -= 16;
  writer.text(data.reference, right - 220, { size: 10, font: bold, align: "right", width: 220 });
  writer.y -= 13;
  writer.text(data.status, right - 220, { size: 9, color: MUTED, align: "right", width: 220 });
  writer.y = Math.min(afterLogo, writer.y) - 18;

  // Employer and employee.
  const partyTop = writer.y;
  const party = (title: string, block: { name: string; lines: string[] }, x: number) => {
    writer.y = partyTop;
    writer.text(title.toUpperCase(), x, { size: 7.5, font: bold, color: MUTED });
    writer.y -= 13;
    writer.text(block.name, x, { size: 10, font: bold });
    for (const line of block.lines.filter(Boolean)) {
      for (const wrapped of wrapText(regular, line, 9, 230)) {
        writer.y -= 12;
        writer.text(wrapped, x, { color: MUTED });
      }
    }
    return writer.y;
  };
  const leftEnd = party("Employer", data.company, PAGE.margin);
  const rightEnd = party("Employee", data.employee, PAGE.margin + 260);
  writer.y = Math.min(leftEnd, rightEnd) - 22;

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
  writer.y -= 28;

  // Earnings (left) and deductions (right), side by side.
  const tableTop = writer.y;
  const table = (
    title: string,
    rows: Array<{ label: string; amount: string }>,
    total: { label: string; amount: string },
    x: number,
  ) => {
    writer.y = tableTop;
    writer.text(title.toUpperCase(), x, { size: 7.5, font: bold, color: MUTED });
    writer.y -= 6;
    writer.current.drawLine({
      start: { x, y: writer.y },
      end: { x: x + COLUMN, y: writer.y },
      thickness: 0.75,
      color: MUTED,
    });
    writer.y -= 14;
    for (const row of rows) {
      for (const [index, line] of wrapText(regular, row.label, 9, COLUMN - 100).entries()) {
        writer.text(line, x);
        if (index === 0) writer.text(row.amount, x + COLUMN - 100, { align: "right", width: 100 });
        writer.y -= 13;
      }
    }
    writer.y -= 2;
    writer.text(total.label, x, { font: bold });
    writer.text(total.amount, x + COLUMN - 100, { font: bold, align: "right", width: 100 });
    return writer.y;
  };
  const earningsEnd = table(
    "Earnings",
    data.earnings,
    { label: "Gross pay", amount: data.gross },
    PAGE.margin,
  );
  const deductionsEnd = table(
    "Deductions",
    data.deductions,
    { label: "Total deductions", amount: data.totalDeductions },
    PAGE.margin + COLUMN + 24,
  );
  writer.y = Math.min(earningsEnd, deductionsEnd) - 24;

  // Net salary box.
  writer.current.drawRectangle({
    x: PAGE.margin,
    y: writer.y - 12,
    width: PAGE.width - PAGE.margin * 2,
    height: 32,
    borderColor: ACCENT,
    borderWidth: 1,
  });
  writer.y += 2;
  writer.text("NET SALARY", PAGE.margin + 12, { size: 10, font: bold, color: INK });
  writer.text(data.net, right - 212, { size: 13, font: bold, color: ACCENT, align: "right", width: 200 });
  writer.y -= 40;
  writer.text(
    "Net salary = Basic + Allowances + Bonus + Overtime - Deductions - Tax - Advances",
    PAGE.margin,
    { size: 8, color: MUTED },
  );

  if (data.note) {
    writer.y -= 22;
    writer.text("NOTE", PAGE.margin, { size: 7.5, font: bold, color: MUTED });
    for (const line of wrapText(regular, data.note, 8.5, PAGE.width - PAGE.margin * 2)) {
      writer.y -= 11.5;
      writer.text(line, PAGE.margin, { size: 8.5 });
    }
  }

  drawFooters(doc, regular, data.footer);
  return doc.save();
}
