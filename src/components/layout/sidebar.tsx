import { ScrollArea } from "@/components/ui/scroll-area";
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";

/** Desktop sidebar (≥ lg). On smaller screens the same navigation opens from `MobileNav`. */
export function Sidebar({ allowedHrefs }: { allowedHrefs: readonly string[] }) {
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Logo />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-4">
          <SidebarNav allowedHrefs={allowedHrefs} />
        </div>
      </ScrollArea>
    </aside>
  );
}
