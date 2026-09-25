"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { findNavItem, visibleNavSections } from "@/config/navigation";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  allowedHrefs: readonly string[];
  /** Called after a link is chosen — the mobile menu uses it to close itself. */
  onNavigate?: () => void;
}

export function SidebarNav({ allowedHrefs, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const activeHref = findNavItem(pathname)?.href;

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {visibleNavSections(allowedHrefs).map((section) => (
        <div key={section.title} className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
            {section.title}
          </p>
          {section.items.map(({ href, label, icon: Icon }) => {
            const active = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-sidebar-foreground transition-colors outline-none",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <Icon
                  className={cn("size-4 shrink-0", active ? "text-sidebar-primary" : "opacity-70")}
                  aria-hidden="true"
                />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
