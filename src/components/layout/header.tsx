import type { ShellContext } from "@/server/services/shell.service";
import { CompanySwitcher } from "./company-switcher";
import { GlobalSearch } from "./global-search";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NotificationsButton } from "./notifications-button";
import { UserMenu } from "./user-menu";

/** Sticky top bar: menu (mobile) · company · search · notifications · account. */
export function Header({ shell }: { shell: ShellContext }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4 lg:px-6">
      <MobileNav allowedHrefs={shell.allowedHrefs} company={shell.company} companies={shell.companies} />
      <Logo className="lg:hidden [&>span:last-child]:hidden sm:[&>span:last-child]:inline" />

      <CompanySwitcher current={shell.company} companies={shell.companies} className="hidden lg:flex" />
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
