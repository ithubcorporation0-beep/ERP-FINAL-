"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ShellCompany } from "@/server/services/shell.service";
import { CompanySwitcher } from "./company-switcher";
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";

/** Hamburger menu shown below the `lg` breakpoint; slides the sidebar navigation in from the left. */
interface MobileNavProps {
  allowedHrefs: readonly string[];
  company: ShellCompany & { logoUrl: string | null };
  companies: ShellCompany[];
}

export function MobileNav({ allowedHrefs, company, companies }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
        <SheetHeader className="h-14 justify-center border-b border-sidebar-border px-4">
          <SheetTitle asChild>
            <div>
              <Logo />
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="border-b border-sidebar-border px-3 py-3">
            <CompanySwitcher current={company} companies={companies} className="w-full" />
          </div>
          <div className="px-3 py-4">
            <SidebarNav allowedHrefs={allowedHrefs} onNavigate={() => setOpen(false)} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
