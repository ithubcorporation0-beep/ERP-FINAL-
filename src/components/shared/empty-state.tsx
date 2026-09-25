export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <section style={{ padding: 32, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 8 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      {description ? <p style={{ color: "var(--muted)" }}>{description}</p> : null}
      {action}
    </section>
  );
}
