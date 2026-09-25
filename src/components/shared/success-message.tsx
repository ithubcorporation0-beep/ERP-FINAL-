import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SuccessMessage({ message }: { message: string }) {
  return (
    <Alert role="status" aria-live="polite">
      <CheckCircle2 aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
