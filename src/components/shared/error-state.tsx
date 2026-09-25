import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
