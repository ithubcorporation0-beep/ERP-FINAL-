import { Construction } from "lucide-react";
import { getNavItem } from "@/config/navigation";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/**
 * Honest placeholder for a module that is not built yet: real title and description from the
 * navigation config, no fake data and no buttons that pretend to work.
 */
export function ModulePlaceholder({ href }: { href: string }) {
  const item = getNavItem(href);
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <EmptyState
        icon={Construction}
        title={`${item.label} is not available yet`}
        description="This module is part of the build plan and will appear here once it is released."
      />
    </>
  );
}
