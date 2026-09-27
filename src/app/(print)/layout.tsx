/** Bare layout for print views: no app shell, so the browser prints only the document. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl bg-background p-4 sm:p-8 print:max-w-none print:p-0">{children}</main>
  );
}
