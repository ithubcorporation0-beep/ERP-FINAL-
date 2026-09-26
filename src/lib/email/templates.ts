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

export const emailTemplates = {
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
