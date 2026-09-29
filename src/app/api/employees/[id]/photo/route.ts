import { NextResponse } from "next/server";
import { handle, readUpload, routeId } from "@/lib/api";
import { MAX_PHOTO_BYTES } from "@/lib/storage/images";
import { requirePermission } from "@/lib/tenant";
import { employeeService } from "@/server/services/employee.service";

type Context = RouteContext<"/api/employees/[id]/photo">;

/** The photo as an image (type verified from its bytes at upload; never SVG). */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:view");
  const photo = await employeeService.photo(ctx, routeId((await params).id, "Employee"));
  return new NextResponse(new Uint8Array(photo.body), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});

export const POST = handle(async (request: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:edit");
  const id = routeId((await params).id, "Employee");
  const file = await readUpload(request, MAX_PHOTO_BYTES, "The photo must be 2 MB or smaller.");
  await employeeService.setPhoto(ctx, id, file.bytes);
  return new NextResponse(null, { status: 204 });
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:edit");
  await employeeService.removePhoto(ctx, routeId((await params).id, "Employee"));
  return new NextResponse(null, { status: 204 });
});
