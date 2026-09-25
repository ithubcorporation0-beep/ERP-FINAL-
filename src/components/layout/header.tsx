import { Building2 } from "lucide-react";
import type { ShellContext } from "@/server/services/shell.service";
import { GlobalSearch } from "./global-search";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NotificationsButton } from "./notifications-button";
import { UserMenu } from "./user-menu";

/** Sticky top bar: menu (mobile) · company · search · notifications · account. */
export function Header({ shell }: { shell: ShellContext }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4 lg:px-6">
      <MobileNav allowedHrefs={shell.allowedHrefs} />
      <Logo className="lg:hidden [&>span:last-child]:hidden sm:[&>span:last-child]:inline" />

      <div
        className="hidden min-w-0 items-center gap-2 text-sm font-medium lg:flex"
        title="Current company"
        aria-label={`Current company: ${shell.company.name}`}
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{shell.company.name}</span>
      </div>
      <span aria-hidden="true" className="mx-2 hidden h-5 w-px shrink-0 bg-border lg:block" />

      <div className="flex flex-1 justify-end sm:justify-start">
        <GlobalSearch allowedHrefs={shell.allowedHrefs} />
      </div>

      <div className="flex items-center gap-1">
        <NotificationsButton unread={shell.unreadNotifications} />
        <UserMenu user={shell.user} companyName={shell.company.name} />
      </div>
    </header>
  );
}
