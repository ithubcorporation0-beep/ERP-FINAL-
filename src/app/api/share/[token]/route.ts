import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { pdfResponse } from "@/lib/pdf/response";
import { shareLinkService } from "@/server/services/share-link.service";

type Context = RouteContext<"/api/share/[token]">;

/**
 * Public: a customer opens a shared quotation or invoice PDF (e.g. from WhatsApp) without an account. The secret
 * token in the URL is the only credential; unknown, expired and revoked links all look the same (404).
 */
export const GET = handle(async (req: Request, { params }: Context) => {
  const document = await shareLinkService.openDocument((await params).token);
  if (!document) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "This link is invalid or has expired." } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = pdfResponse(document.bytes, document.filename, req);
  response.headers.set("X-Robots-Tag", "noindex");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
});
