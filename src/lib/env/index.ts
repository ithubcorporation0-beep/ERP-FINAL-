import "server-only";
import { parseServerEnv, type ServerEnv } from "./schema";

let cached: ServerEnv | undefined;

/** Validated server environment. Throws on first access if anything is missing or malformed. */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

export type { ServerEnv };
