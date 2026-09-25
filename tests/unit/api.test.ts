import { describe, expect, it, vi } from "vitest";
import { handle, type ApiErrorBody } from "@/lib/api";
import { ForbiddenError } from "@/lib/errors";
import { runAction } from "@/lib/action";
import { logger } from "@/lib/logger";

describe("handle() for API routes", () => {
  it("returns the handler's response when nothing is thrown", async () => {
    const route = handle(async () => Response.json({ ok: true }));
    expect(await (await route()).json()).toEqual({ ok: true });
  });

  it("converts AppErrors into a JSON error with the right status and a request id", async () => {
    const route = handle(async (_req: Request) => {
      throw new ForbiddenError();
    });
    const response = await route(new Request("http://test", { headers: { "x-request-id": "req-12345678" } }));
    const body = (await response.json()) as ApiErrorBody;
    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: "FORBIDDEN", requestId: "req-12345678" });
    expect(response.headers.get("x-request-id")).toBe("req-12345678");
  });

  it("logs unexpected errors and returns a generic 500", async () => {
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const route = handle(async () => {
      throw new Error("secret internals");
    });
    const response = await route();
    const body = (await response.json()) as ApiErrorBody;
    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("secret internals");
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("runAction() for server actions", () => {
  it("wraps success and failure in an ActionResult", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
    expect(
      await runAction(async () => {
        throw new ForbiddenError();
      }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
