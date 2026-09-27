import { detectImageType, IMAGE_TYPES } from "./images";

/** Largest document accepted on a customer (and later on other records). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const DOCUMENT_TYPES_HINT = "PDF, image (PNG, JPEG, WebP), Word (.docx), Excel (.xlsx), CSV or text";

export interface DocumentType {
  contentType: string;
  extension: string;
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

const OFFICE: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const TEXT: Record<string, string> = { txt: "text/plain", csv: "text/csv" };

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    // Not valid UTF-8 → treated as binary, i.e. not an accepted text file.
    return false;
  }
}

/**
 * Decides what an uploaded document really is from its bytes. Binary formats are recognised by their signature;
 * ZIP-based Office files and text files additionally need the matching extension. Anything else is refused
 * (including HTML and SVG, which a browser could execute). Files are always served as downloads.
 */
export function detectDocumentType(bytes: Uint8Array, fileName: string): DocumentType | null {
  const extension = extensionOf(fileName);
  const image = detectImageType(bytes);
  if (image) return { contentType: image, extension: IMAGE_TYPES[image] };
  if (startsWith(bytes, PDF)) return { contentType: "application/pdf", extension: "pdf" };
  const office = OFFICE[extension];
  if (office && startsWith(bytes, ZIP)) return { contentType: office, extension };
  const text = TEXT[extension];
  if (text && isPlainText(bytes)) return { contentType: text, extension };
  return null;
}

/** A safe display/download name: no folders, no control characters, at most 150 characters. */
export function cleanFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "document";
  if (cleaned.length <= 150) return cleaned;
  const extension = extensionOf(cleaned);
  return extension && extension.length < 10
    ? `${cleaned.slice(0, 149 - extension.length)}.${extension}`
    : cleaned.slice(0, 150);
}

/** `Content-Disposition` value that works for non-ASCII names (RFC 6266 / 5987). */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
