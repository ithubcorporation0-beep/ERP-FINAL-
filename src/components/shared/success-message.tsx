export function SuccessMessage({ message }: { message: string }) {
  return (
    <p role="status" aria-live="polite" style={{ color: "seagreen", margin: 0 }}>
      {message}
    </p>
  );
}
