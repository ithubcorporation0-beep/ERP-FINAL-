"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action";
import { whatsappShareUrl } from "@/lib/sharing/whatsapp";

interface WhatsAppButtonProps {
  /** Creates a share link to the document's PDF on the server. */
  createLink: () => Promise<ActionResult<{ url: string }>>;
  phone: string | null;
  /** Message text; the link is appended. */
  message: string;
}

/** Opens WhatsApp with a prepared message and a secure, expiring link to the PDF (see src/lib/sharing). */
export function WhatsAppButton({ createLink, phone, message }: WhatsAppButtonProps) {
  const [busy, setBusy] = useState(false);

  async function share() {
    // Open the tab now (inside the click) so pop-up blockers allow it, then point it at WhatsApp.
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    const result = await createLink();
    setBusy(false);
    if (!result.ok) {
      tab?.close();
      toast.error(result.error.message);
      return;
    }
    const url = whatsappShareUrl({ phone, text: `${message}\n${result.data.url}` });
    if (tab) tab.location.href = url;
    else window.location.href = url;
  }

  return (
    <Button type="button" variant="outline" onClick={() => void share()} disabled={busy}>
      <MessageCircle aria-hidden="true" />
      WhatsApp
    </Button>
  );
}
