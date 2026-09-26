import { describe, expect, it } from "vitest";
import { isPublicPath, loginRedirectFor } from "@/lib/auth/routes";
import { safeNextPath } from "@/config/navigation";

describe("route protection (proxy decision)", () => {
  it("sends signed-out visitors of protected pages to login, remembering where they were going", () => {
    expect(loginRedirectFor("/users", "?page=2", false)).toBe("/login?next=%2Fusers%3Fpage%3D2");
    expect(loginRedirectFor("/", "", false)).toBe("/login");
  });

  it("lets public pages and visitors with a session cookie through", () => {
    for (const path of [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/accept-invite",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
      expect(loginRedirectFor(path, "", false)).toBeNull();
    }
    expect(loginRedirectFor("/users", "", true)).toBeNull();
    expect(isPublicPath("/login-as-admin")).toBe(false);
  });
});

describe("safeNextPath (open-redirect protection)", () => {
  it("allows only same-site paths", () => {
    expect(safeNextPath("/roles/123?x=1")).toBe("/roles/123?x=1");
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
