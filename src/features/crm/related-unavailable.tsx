import { UnavailableNote } from "@/components/shared/unavailable-note";
import { MODULE_RELEASES, type ModuleKey } from "@/config/modules";

/** Placeholder for records of a module that isn't built yet (invoices, payments, projects). No sample rows. */
export function RelatedUnavailable({ records, module }: { records: string; module: ModuleKey }) {
  const release = MODULE_RELEASES[module];
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
      <p className="text-sm font-medium">This customer’s {records} will be listed here.</p>
      <UnavailableNote module={release.label} phase={release.phase} />
    </div>
  );
}
