import "server-only";
import { attachmentHeader } from "@/lib/storage/documents";

/** A generated PDF as an HTTP response: `?download=1` saves it, otherwise the browser shows it (e.g. to print). */
export function pdfResponse(bytes: Uint8Array, filename: string, request: Request): Response {
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": download
        ? attachmentHeader(filename)
        : attachmentHeader(filename).replace(/^attachment/, "inline"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
