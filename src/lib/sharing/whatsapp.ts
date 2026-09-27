/**
 * WhatsApp sharing — architecture:
 *
 * 1. Click-to-chat (today): `whatsappShareUrl()` builds a https://wa.me link that opens WhatsApp (app or web) with
 *    a prepared message. The message contains a share link (`/api/share/<token>`) to the document's PDF, so the
 *    customer needs no account. Share links expire and can be revoked (see share-link.service.ts).
 * 2. WhatsApp Business API (later): implement `WhatsAppSender` with a provider (Meta Cloud API, Twilio, …) and
 *    send the same message + PDF from the server. Callers already pass everything a provider needs.
 */

export interface WhatsAppMessage {
  /** Recipient in any common format ("+971 50 123 4567"); digits are extracted. Empty = let the user choose. */
  phone?: string | null;
  text: string;
}

/** Contract for a future server-side sender (WhatsApp Business API). */
export interface WhatsAppSender {
  send(
    message: WhatsAppMessage & { phone: string; attachment?: { filename: string; url: string } },
  ): Promise<void>;
}

/** wa.me expects the full international number, digits only (no +, spaces or leading zeros of an exit code). */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

/** https://wa.me/<number>?text=… (or https://wa.me/?text=… to pick the contact in WhatsApp). */
export function whatsappShareUrl({ phone, text }: WhatsAppMessage): string {
  const number = phone ? whatsappNumber(phone) : null;
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
}
