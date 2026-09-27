import type { DocumentPresentation } from "@/server/services/sales-shared";

/**
 * A quotation, sales order or invoice as a printable page — the same content as the PDF. Used on the detail
 * pages and the print view.
 */
export function DocumentView({ view, logoUrl }: { view: DocumentPresentation; logoUrl?: string | null }) {
  return (
    <article className="space-y-6 rounded-xl border bg-card p-5 text-sm shadow-xs sm:p-8 print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, per-company image served by our own API
            <img src={logoUrl} alt={view.company.name} className="mb-2 h-12 w-auto object-contain" />
          ) : (
            <p className="text-lg font-semibold">{view.company.name}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-xl font-semibold tracking-wide text-primary uppercase">{view.title}</p>
          <p className="font-mono text-base font-semibold">{view.code}</p>
          {view.status ? <p className="text-muted-foreground">{view.status}</p> : null}
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { label: "From", party: view.company },
          { label: "Bill to", party: view.customer },
        ].map(({ label, party }) => (
          <section key={label}>
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</h2>
            <p className="mt-1 font-semibold">{party.name}</p>
            {party.lines.filter(Boolean).map((line) => (
              <p key={line} className="text-muted-foreground">
                {line}
              </p>
            ))}
          </section>
        ))}
      </div>

      <dl className="flex flex-wrap gap-x-10 gap-y-3">
        {view.facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {fact.label}
            </dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[36rem] text-left">
          <caption className="sr-only">Lines</caption>
          <thead className="border-b text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="py-2 font-medium">
                Description
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Unit price
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Disc.
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Tax
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody data-numeric>
            {view.items.map((item, index) => (
              <tr key={index} className="border-b align-top last:border-0">
                <td className="py-2 pr-4 whitespace-pre-wrap">{item.description}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right whitespace-nowrap">{item.unitPrice}</td>
                <td className="py-2 text-right">{item.discount}</td>
                <td className="py-2 text-right">{item.tax}</td>
                <td className="py-2 text-right whitespace-nowrap">{item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1" data-numeric>
        {view.totals.map((total) => (
          <div key={total.label} className="contents">
            <dt className={total.strong ? "border-t pt-1 font-semibold" : "text-muted-foreground"}>
              {total.label}
            </dt>
            <dd className={total.strong ? "border-t pt-1 text-right font-semibold" : "text-right"}>
              {total.value}
            </dd>
          </div>
        ))}
      </dl>

      {view.notes ? (
        <section>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap">{view.notes}</p>
        </section>
      ) : null}
      {view.terms ? (
        <section>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Terms and conditions
          </h2>
          <p className="mt-1 whitespace-pre-wrap">{view.terms}</p>
        </section>
      ) : null}
    </article>
  );
}
