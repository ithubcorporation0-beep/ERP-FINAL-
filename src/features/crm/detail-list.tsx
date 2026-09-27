/** Label/value pairs for record detail pages. Empty values show a dash so the layout stays predictable. */
export function DetailList({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{item.label}</dt>
          <dd className="mt-1 text-sm break-words">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
