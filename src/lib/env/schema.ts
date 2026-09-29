import { z } from "zod";

const optional = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const booleanFlag = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1");

/** Server-side environment variables. Keep in sync with `.env.example`. */
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required" })
    .trim()
    .min(1, "DATABASE_URL is required")
    .refine((value) => /^postgres(ql)?:\/\//.test(value), "DATABASE_URL must be a postgresql:// URL"),
  APP_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .optional()
    .or(z.literal("").transform(() => undefined)),

  /** Anyone may create a new company account at /register. Off by default. */
  AUTH_ALLOW_REGISTRATION: booleanFlag,

  /**
   * How emails are delivered: "smtp" (real email), "console" (printed to the server log — local/CI only)
   * or "memory" (kept in memory — automated tests only). Default: smtp in production, console otherwise.
   */
  EMAIL_TRANSPORT: z
    .enum(["smtp", "console", "memory"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  /** "true" for implicit TLS (usually port 465); otherwise STARTTLS is used when the server offers it. */
  SMTP_SECURE: booleanFlag,
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  EMAIL_FROM: optional,

  /**
   * Where uploaded files (company logos, later attachments) are kept: "local" (a folder on this server — dev and
   * single-server installs) or "s3" (any S3-compatible service: AWS S3, Cloudflare R2, MinIO…).
   * Default: s3 in production, local otherwise.
   */
  STORAGE_DRIVER: z
    .enum(["local", "s3"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  STORAGE_LOCAL_DIR: z.string().trim().min(1).default(".storage"),
  STORAGE_REGION: z.string().trim().min(1).default("auto"),
  STORAGE_ENDPOINT: optional,
  STORAGE_BUCKET: optional,
  STORAGE_ACCESS_KEY: optional,
  STORAGE_SECRET_KEY: optional,

  /**
   * Key that encrypts restricted personal data at rest (employee bank account numbers): 32 random bytes,
   * base64-encoded (`openssl rand -base64 32`). Required in production. Changing it makes stored values unreadable.
   */
  DATA_ENCRYPTION_KEY: optional,
});

export const serverEnvSchema = baseSchema
  .transform((env) => ({
    ...env,
    EMAIL_TRANSPORT: env.EMAIL_TRANSPORT ?? (env.NODE_ENV === "production" ? "smtp" : "console"),
    STORAGE_DRIVER: env.STORAGE_DRIVER ?? (env.NODE_ENV === "production" ? "s3" : "local"),
  }))
  .superRefine((env, context) => {
    if (env.EMAIL_TRANSPORT === "smtp") {
      for (const key of ["SMTP_HOST", "EMAIL_FROM"] as const) {
        if (!env[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when EMAIL_TRANSPORT is smtp`,
          });
        }
      }
    }
    if (env.STORAGE_DRIVER === "s3") {
      for (const key of [
        "STORAGE_ENDPOINT",
        "STORAGE_BUCKET",
        "STORAGE_ACCESS_KEY",
        "STORAGE_SECRET_KEY",
      ] as const) {
        if (!env[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when STORAGE_DRIVER is s3`,
          });
        }
      }
    }
    if (env.DATA_ENCRYPTION_KEY && Buffer.from(env.DATA_ENCRYPTION_KEY, "base64").byteLength !== 32) {
      context.addIssue({
        code: "custom",
        path: ["DATA_ENCRYPTION_KEY"],
        message: "DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
      });
    }
    if (!env.DATA_ENCRYPTION_KEY && env.NODE_ENV === "production") {
      context.addIssue({
        code: "custom",
        path: ["DATA_ENCRYPTION_KEY"],
        message: "DATA_ENCRYPTION_KEY is required in production",
      });
    }
    if (env.EMAIL_TRANSPORT === "memory" && env.NODE_ENV !== "test") {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "EMAIL_TRANSPORT=memory is only allowed in tests",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parses env vars, throwing one readable error that lists every problem (never the values). */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment variables:\n${problems.join("\n")}\nSee .env.example.`);
  }
  return result.data;
}
