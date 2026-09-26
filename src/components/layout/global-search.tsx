"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { visibleNavSections } from "@/config/navigation";
import { NAV_ICONS } from "./nav-icons";

/**
 * Global search (Ctrl/⌘ + K). Currently searches the pages the user can access; record search
 * (customers, invoices, …) is added as each module ships.
 */
export function GlobalSearch({ allowedHrefs }: { allowedHrefs: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-full max-w-sm justify-start gap-2 px-3 font-normal text-muted-foreground shadow-xs sm:flex"
      >
        <Search aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[0.6875rem] font-medium">
          Ctrl K
        </kbd>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden"
        aria-label="Search"
      >
        <Search />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search pages">
        {/* CommandDialog only provides the dialog; the cmdk <Command> root must wrap its contents. */}
        <Command>
          <CommandInput placeholder="Search pages…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {visibleNavSections(allowedHrefs).map((section) => (
              <CommandGroup key={section.title} heading={section.title}>
                {section.items.map(({ href, label, description, icon }) => {
                  const Icon = NAV_ICONS[icon];
                  return (
                    <CommandItem key={href} value={`${label} ${description}`} onSelect={() => go(href)}>
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                      <span className="ml-2 truncate text-xs text-muted-foreground">{description}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
