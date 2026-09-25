import { headers } from "next/headers";

/** Client IP and user agent of the current request, for sessions and the audit log. */
export async function requestClientInfo(): Promise<{ ipAddress?: string; userAgent?: string }> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipAddress = forwarded || list.get("x-real-ip") || undefined;
  const userAgent = list.get("user-agent")?.slice(0, 500) || undefined;
  return { ipAddress, userAgent };
}
