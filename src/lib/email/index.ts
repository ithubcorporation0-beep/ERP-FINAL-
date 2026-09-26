import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Emails captured by the "memory" transport (automated tests only). */
export const memoryOutbox: EmailMessage[] = [];

let smtp: Transporter | undefined;

function smtpTransport(): Transporter {
  const env = getServerEnv();
  smtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return smtp;
}

/**
 * Sends an email with the configured transport (EMAIL_TRANSPORT). Failures throw — callers decide
 * whether a failed email should fail the whole operation.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const env = getServerEnv();
  switch (env.EMAIL_TRANSPORT) {
    case "memory":
      memoryOutbox.push(message);
      return;
    case "console":
      // Development/CI only: links are printed so flows can be completed without a mail server.
      logger.info("Email (console transport — not delivered)", {
        to: message.to,
        subject: message.subject,
        body: message.text,
      });
      return;
    case "smtp":
      await smtpTransport().sendMail({ from: env.EMAIL_FROM, ...message });
      return;
  }
}

/** Absolute link into the app, e.g. appUrl("/reset-password", { token }). */
export function appUrl(path: string, query: Record<string, string> = {}): string {
  const url = new URL(path, getServerEnv().APP_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}
