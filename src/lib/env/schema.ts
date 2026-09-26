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

  STORAGE_ENDPOINT: optional,
  STORAGE_BUCKET: optional,
  STORAGE_ACCESS_KEY: optional,
  STORAGE_SECRET_KEY: optional,
});

export const serverEnvSchema = baseSchema
  .transform((env) => ({
    ...env,
    EMAIL_TRANSPORT: env.EMAIL_TRANSPORT ?? (env.NODE_ENV === "production" ? "smtp" : "console"),
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
