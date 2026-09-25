export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header style={{ marginBottom: 24 }}>
      <h1 style={{ margin: 0 }}>{title}</h1>
      {description ? <p style={{ color: "var(--muted)" }}>{description}</p> : null}
    </header>
  );
}
