import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localDriver, s3Driver } from "@/lib/storage/drivers";
import { detectImageType } from "@/lib/storage/images";
import { assertValidKey, companyKey } from "@/lib/storage/keys";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

describe("storage keys", () => {
  it("put every company's files under its own prefix", () => {
    expect(companyKey("abc", "logo", "x.png")).toBe("companies/abc/logo/x.png");
  });

  it("reject path traversal and odd keys", () => {
    for (const key of ["../etc/passwd", "companies/../x", "/abs/path", "a//b", "a/", "", "a b"]) {
      expect(() => assertValidKey(key), key).toThrow();
    }
  });
});

describe("detectImageType", () => {
  it("recognizes PNG, JPEG and WebP by their bytes, and rejects SVG and junk", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(WEBP)).toBe("image/webp");
    expect(detectImageType(SVG)).toBeNull();
    expect(detectImageType(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("local storage driver", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("stores, reads and deletes files inside its folder only", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "erp-storage-"));
    const storage = localDriver(dir);
    await storage.put("companies/a/logo/one.png", PNG, "image/png");
    expect(await storage.get("companies/a/logo/one.png")).toEqual(PNG);
    await storage.delete("companies/a/logo/one.png");
    expect(await storage.get("companies/a/logo/one.png")).toBeNull();
    await expect(storage.delete("companies/a/logo/missing.png")).resolves.toBeUndefined();
    await expect(storage.get("../outside.png")).rejects.toThrow();
  });
});

describe("S3-compatible storage driver", () => {
  it("sends signed path-style requests and treats 404 as missing", async () => {
    const requests: Request[] = [];
    const storage = s3Driver({
      endpoint: "https://s3.example.test/",
      bucket: "erp-files",
      region: "auto",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      fetch: async (input) => {
        const request = input instanceof Request ? input : new Request(input);
        requests.push(request);
        return new Response(request.method === "GET" ? null : "", {
          status: request.method === "GET" ? 404 : 200,
        });
      },
    });

    await storage.put("companies/a/logo/one.png", PNG, "image/png");
    expect(await storage.get("companies/a/logo/one.png")).toBeNull();
    await storage.delete("companies/a/logo/one.png");

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "PUT https://s3.example.test/erp-files/companies/a/logo/one.png",
      "GET https://s3.example.test/erp-files/companies/a/logo/one.png",
      "DELETE https://s3.example.test/erp-files/companies/a/logo/one.png",
    ]);
    expect(requests[0]?.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
    expect(requests[0]?.headers.get("content-type")).toBe("image/png");
  });
});
