import { siteConfig } from "@/config/site";
import type { EmailMessage } from "./index";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** One consistent, plain layout for every transactional email (text + simple HTML). */
function layout(to: string, subject: string, paragraphs: string[], action?: { label: string; url: string }) {
  const text = [
    ...paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    `— ${siteConfig.name}`,
  ].join("\n\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;line-height:1.5">
${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
${
  action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#475569">Or paste this link into your browser: ${escapeHtml(action.url)}</p>`
    : ""
}
<p style="font-size:12px;color:#475569">— ${escapeHtml(siteConfig.name)}</p>
</body></html>`;
  return { to, subject, text, html } satisfies EmailMessage;
}

export interface SalesDocumentEmail {
  companyName: string;
  /** "Invoice" or "Quotation". */
  documentLabel: string;
  code: string;
  customerName: string;
  /** Preformatted, e.g. "AED 1,250.00". */
  total: string;
  /** e.g. "Due on 30 Oct 2026" or "Valid until 30 Oct 2026". */
  dateLine: string;
  /** Optional personal message from the sender. */
  message?: string;
}

export const emailTemplates = {
  /** An ERP notification from the email outbox: the stored subject and paragraphs, and a link into the app. */
  notification: (to: string, message: { subject: string; paragraphs: string[]; url?: string | null }) =>
    layout(
      to,
      message.subject,
      message.paragraphs,
      message.url ? { label: "Open in IT Hub ERP", url: message.url } : undefined,
    ),

  /** A quotation or invoice sent to a customer; the PDF is attached by the caller. */
  salesDocument: (to: string, doc: SalesDocumentEmail) =>
    layout(to, `${doc.documentLabel} ${doc.code} from ${doc.companyName}`, [
      `Dear ${doc.customerName},`,
      ...(doc.message ? [doc.message] : []),
      `Please find attached ${doc.documentLabel.toLowerCase()} ${doc.code} for ${doc.total}. ${doc.dateLine}.`,
      `Kind regards,\n${doc.companyName}`,
    ]),

  verifyEmail: (to: string, name: string, url: string) =>
    layout(
      to,
      `Verify your email for ${siteConfig.name}`,
      [`Hi ${name},`, "Please confirm your email address. The link expires in 24 hours."],
      { label: "Verify email", url },
    ),

  passwordReset: (to: string, name: string, url: string) =>
    layout(
      to,
      `Reset your ${siteConfig.name} password`,
      [
        `Hi ${name},`,
        "We received a request to reset your password. The link expires in 1 hour and can be used once.",
        "If you didn't ask for this, you can ignore this email — your password stays the same.",
      ],
      { label: "Choose a new password", url },
    ),

  passwordChanged: (to: string, name: string) =>
    layout(to, `Your ${siteConfig.name} password was changed`, [
      `Hi ${name},`,
      "Your password was just changed and your other sessions were signed out.",
      "If this wasn't you, reset your password immediately and contact your administrator.",
    ]),

  invitation: (to: string, inviter: string, company: string, url: string) =>
    layout(
      to,
      `${inviter} invited you to ${company} on ${siteConfig.name}`,
      [
        `${inviter} invited you to join ${company}.`,
        "Accept the invitation to set your name and password. The link expires in 7 days.",
      ],
      { label: "Accept invitation", url },
    ),

  addedToCompany: (to: string, inviter: string, company: string, url: string) =>
    layout(
      to,
      `You now have access to ${company}`,
      [`${inviter} gave your existing account access to ${company}.`],
      { label: "Sign in", url },
    ),

  accountExists: (to: string, url: string) =>
    layout(
      to,
      `You already have a ${siteConfig.name} account`,
      [
        "Someone (hopefully you) tried to register with this email address, but an account already exists.",
        "If you forgot your password, you can reset it here. Otherwise, ignore this email.",
      ],
      { label: "Reset password", url },
    ),
};
