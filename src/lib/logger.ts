/**
 * Minimal structured logger. Production: one JSON object per line (readable by log platforms).
 * Development: readable console output. Sensitive keys are always redacted.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|api[-_]?key/i;

function minimumLevel(): Level {
  const configured = process.env.LOG_LEVEL;
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/** Makes context safe to log: redacts secrets and flattens Error objects (including `cause`). */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause === undefined ? {} : { cause: sanitize(value.cause, depth + 1) }),
    };
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE.test(key) ? "[redacted]" : sanitize(item, depth + 1),
      ]),
    );
  }
  return value;
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[minimumLevel()]) return;
  const safe = context ? sanitize(context) : undefined;
  if (process.env.NODE_ENV === "production") {
    console[level === "debug" ? "log" : level](
      JSON.stringify({ level, message, time: new Date().toISOString(), ...(safe as object) }),
    );
  } else {
    console[level === "debug" ? "log" : level](`[${level}] ${message}`, safe ?? "");
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};
