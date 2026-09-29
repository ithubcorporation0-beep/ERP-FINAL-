"use client";

import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/features/auth/form-status";
import { apiErrorMessage } from "@/lib/api-client";

export interface DocumentEntry {
  id: string;
  name: string;
  sizeLabel: string;
  uploadedBy: string | null;
  uploadedAt: string;
  uploadedAtLabel: string;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv,.txt";
const MAX_BYTES = 10 * 1024 * 1024;

interface DocumentPanelProps {
  /** Collection endpoint, e.g. `/api/customers/<id>/documents`; files are at `<endpoint>/<documentId>`. */
  endpoint: string;
  documents: DocumentEntry[];
  canEdit: boolean;
}

/** Upload, download and delete a record's documents (customers, employees). The server checks every file again. */
export function DocumentPanel({ endpoint, documents, canEdit }: DocumentPanelProps) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<DocumentEntry | null>(null);
  const base = endpoint;

  async function upload(file: File) {
    setError(undefined);
    if (file.size > MAX_BYTES) return setError("Files must be 10 MB or smaller.");
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(base, { method: "POST", body });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!response.ok) return setError(await apiErrorMessage(response, "Upload"));
    toast.success(`${file.name} uploaded.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            PDF, images, Word (.docx), Excel (.xlsx), CSV or text — up to 10 MB each.
          </p>
          <div>
            <input
              ref={input}
              id={inputId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label="Choose a document to upload"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {busy ? "Uploading…" : "Upload document"}
            </Button>
          </div>
        </div>
      ) : null}
      <FormStatus tone="error" message={error} />

      {documents.length === 0 ? (
        <EmptyState size="compact" icon={FileText} title="No documents yet" />
      ) : (
        <ul className="divide-y rounded-lg border" aria-label="Documents">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-3 p-3">
              <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{document.name}</p>
                <p className="text-xs text-muted-foreground">
                  {document.sizeLabel} · {document.uploadedBy ?? "Unknown"} ·{" "}
                  <time dateTime={document.uploadedAt}>{document.uploadedAtLabel}</time>
                </p>
              </div>
              <Button asChild variant="ghost" size="icon-sm">
                <a href={`${base}/${document.id}`} download aria-label={`Download ${document.name}`}>
                  <Download />
                </a>
              </Button>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${document.name}`}
                  onClick={() => setRemoving(document)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title="Delete this document?"
        description={`“${removing?.name ?? ""}” will be deleted permanently.`}
        confirmLabel="Delete document"
        onConfirm={async () => {
          if (!removing) return;
          const response = await fetch(`${base}/${removing.id}`, { method: "DELETE" });
          if (!response.ok) throw new Error(await apiErrorMessage(response, "Delete"));
          toast.success("Document deleted.");
          setRemoving(null);
          router.refresh();
        }}
      />
    </div>
  );
}
