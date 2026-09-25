import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NAVIGATION } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { logoutAction } from "@/server/actions/auth.actions";

export function Sidebar({ userName }: { userName: string }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar p-4 text-sidebar-foreground">
      <Link href="/dashboard" className="px-2 text-base font-semibold">
        {siteConfig.name}
      </Link>
      <nav aria-label="Main" className="mt-6 flex flex-1 flex-col gap-1">
        {NAVIGATION.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <form action={logoutAction} className="mt-6 space-y-2 border-t pt-4">
        <p className="truncate px-2 text-sm text-muted-foreground">{userName}</p>
        <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </form>
    </aside>
  );
}
