import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Inline result message for auth forms (errors are announced to screen readers). */
export function FormStatus({ tone, message }: { tone: "error" | "success"; message?: string }) {
  if (!message) return null;
  return tone === "error" ? (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : (
    <Alert role="status" aria-live="polite">
      <CheckCircle2 aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
