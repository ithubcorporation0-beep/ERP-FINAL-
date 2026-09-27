"use client";

import { Building2, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/features/auth/form-status";
import { apiErrorMessage } from "@/lib/api-client";

const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 1024 * 1024;

/** Upload, preview and remove the company logo (PNG, JPEG or WebP, max 1 MB). The server re-validates everything. */
export function LogoUploader({ logoUrl, readOnly }: { logoUrl: string | null; readOnly: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    setError(undefined);
    if (file.size > MAX_BYTES) return setError("The logo must be 1 MB or smaller.");
    setBusy(true);
    const body = new FormData();
    body.append("logo", file);
    const response = await fetch("/api/company/logo", { method: "POST", body });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!response.ok) return setError(await apiErrorMessage(response, "Upload"));
    toast.success("Logo updated.");
    router.refresh();
  }

  async function remove() {
    const response = await fetch("/api/company/logo", { method: "DELETE" });
    if (!response.ok) throw new Error(await apiErrorMessage(response, "Upload"));
    toast.success("Logo removed.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, per-company image served by our own API
          <img src={logoUrl} alt="Current company logo" className="size-full object-contain p-1.5" />
        ) : (
          <Building2 className="size-8 text-muted-foreground" aria-label="No logo yet" />
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          PNG, JPEG or WebP, up to 1 MB. A square image works best.
        </p>
        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              id={inputId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label="Choose logo image"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
            {logoUrl ? (
              <ConfirmDialog
                title="Remove the company logo?"
                description="The logo disappears for everyone in the company. You can upload a new one at any time."
                confirmLabel="Remove logo"
                onConfirm={remove}
                trigger={
                  <Button type="button" variant="ghost">
                    Remove
                  </Button>
                }
              />
            ) : null}
          </div>
        )}
        <FormStatus tone="error" message={error} />
      </div>
    </div>
  );
}
