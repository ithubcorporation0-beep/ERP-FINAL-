export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ padding: 16, border: "1px solid crimson", borderRadius: 8 }}>
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} style={{ marginTop: 8 }}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
