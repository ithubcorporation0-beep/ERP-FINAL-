import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { assertValidKey } from "./keys";

/** Minimal file storage used by the app. Content types are stored in the database next to the key. */
export interface StorageDriver {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The file's bytes, or null if it doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Deletes the file; deleting a missing file is not an error. */
  delete(key: string): Promise<void>;
}

/** Files in a folder on this server. Development, tests and single-server installs with a persistent disk. */
export function localDriver(rootDir: string): StorageDriver {
  const root = path.resolve(rootDir);
  function resolve(key: string): string {
    assertValidKey(key);
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) throw new Error("Storage key escapes the storage folder");
    return target;
  }
  return {
    async put(key, body) {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(resolve(key)));
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** Any S3-compatible service (AWS S3, Cloudflare R2, MinIO, …) using signed path-style requests. */
export function s3Driver(config: S3Config): StorageDriver {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
  });
  const base = config.endpoint.replace(/\/+$/, "");
  const doFetch = config.fetch ?? fetch;

  function url(key: string): string {
    assertValidKey(key);
    return `${base}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async function send(method: string, key: string, init: { body?: Uint8Array; contentType?: string } = {}) {
    const request = await client.sign(url(key), {
      method,
      // Copy into a plain ArrayBuffer-backed array (what fetch accepts as a body).
      body: init.body ? new Uint8Array(init.body) : undefined,
      headers: init.contentType ? { "content-type": init.contentType } : undefined,
    });
    return doFetch(request);
  }

  return {
    async put(key, body, contentType) {
      const response = await send("PUT", key, { body, contentType });
      if (!response.ok) throw new Error(`Storage upload failed (${response.status})`);
    },
    async get(key) {
      const response = await send("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Storage download failed (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    },
    async delete(key) {
      const response = await send("DELETE", key);
      if (!response.ok && response.status !== 404)
        throw new Error(`Storage delete failed (${response.status})`);
    },
  };
}
