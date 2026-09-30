import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * Shared A4 layout helpers for generated PDFs (sales documents, salary slips): page geometry, colours, a
 * cursor-based text writer, safe text for the built-in fonts, word wrapping, logo embedding and page footers.
 */

export const PAGE = { width: 595.28, height: 841.89, margin: 48 };
export const INK = rgb(0.06, 0.09, 0.16);
export const MUTED = rgb(0.4, 0.45, 0.53);
export const LINE = rgb(0.86, 0.88, 0.91);
export const ACCENT = rgb(0.15, 0.39, 0.92);

export class Writer {
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

export async function embedLogo(
  doc: PDFDocument,
  logo: { bytes: Uint8Array; contentType: string } | null | undefined,
): Promise<PDFImage | null> {
  if (!logo) return null;
  if (logo.contentType === "image/png") return doc.embedPng(logo.bytes);
  if (logo.contentType === "image/jpeg") return doc.embedJpg(logo.bytes);
  return null; // WebP can't be embedded by pdf-lib; the company name is shown instead.
}

/** Draws "<footer> · Page n of m" centred at the bottom of every page. */
export function drawFooters(doc: PDFDocument, font: PDFFont, footer?: string) {
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const text = safeText(font, `${footer ? `${footer}  ·  ` : ""}Page ${index + 1} of ${pages.length}`);
    page.drawText(text, {
      x: (PAGE.width - font.widthOfTextAtSize(text, 7.5)) / 2,
      y: PAGE.margin / 2,
      size: 7.5,
      font,
      color: MUTED,
    });
  });
}
