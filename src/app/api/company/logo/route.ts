import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { MAX_LOGO_BYTES } from "@/lib/storage/images";
import { requirePermission, requireTenant } from "@/lib/tenant";
import { companyService } from "@/server/services/company.service";

/**
 * The CURRENT company's logo. There is no company id in the URL: the company always comes from the signed-in
 * user's membership, so one company can never fetch or change another company's logo.
 */
export const GET = handle(async () => {
  const ctx = await requireTenant();
  const logo = await companyService.getLogo(ctx);
  if (!logo) throw new NotFoundError("Logo");
  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.contentType,
      // Per-user cache only; the page adds ?v=<updated time> so a new logo shows immediately.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});

/** Upload as multipart form data with a `logo` file field. */
export const POST = handle(async (request: Request) => {
  const ctx = await requirePermission("settings:manage");
  // Refuse obviously oversized bodies before reading them into memory.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_LOGO_BYTES + 64 * 1024)
    throw new ValidationError("The logo must be 1 MB or smaller.");
  const file = (await request.formData()).get("logo");
  if (!(file instanceof File)) throw new ValidationError("Choose an image file.");
  if (file.size > MAX_LOGO_BYTES) throw new ValidationError("The logo must be 1 MB or smaller.");
  await companyService.setLogo(ctx, new Uint8Array(await file.arrayBuffer()));
  return new NextResponse(null, { status: 204 });
});

export const DELETE = handle(async () => {
  const ctx = await requirePermission("settings:manage");
  await companyService.removeLogo(ctx);
  return new NextResponse(null, { status: 204 });
});
