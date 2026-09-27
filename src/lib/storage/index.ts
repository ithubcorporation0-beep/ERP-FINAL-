import "server-only";
import { getServerEnv } from "@/lib/env";
import { localDriver, s3Driver, type StorageDriver } from "./drivers";

let driver: StorageDriver | undefined;

/** The configured storage driver (STORAGE_DRIVER). */
export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = getServerEnv();
  driver =
    env.STORAGE_DRIVER === "s3"
      ? s3Driver({
          endpoint: env.STORAGE_ENDPOINT ?? "",
          bucket: env.STORAGE_BUCKET ?? "",
          region: env.STORAGE_REGION,
          accessKeyId: env.STORAGE_ACCESS_KEY ?? "",
          secretAccessKey: env.STORAGE_SECRET_KEY ?? "",
        })
      : localDriver(env.STORAGE_LOCAL_DIR);
  return driver;
}

export { companyKey } from "./keys";
export type { StorageDriver } from "./drivers";
