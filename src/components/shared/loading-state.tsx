export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ padding: 24, color: "var(--muted)" }}>
      {label}
    </div>
  );
}
