import type { ShellContext } from "@/server/services/shell.service";
import { Breadcrumbs } from "./breadcrumbs";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

/**
 * The signed-in application frame: sidebar (desktop), header, breadcrumbs and a centered,
 * width-limited content area. Responsive from 320px phones to wide desktops.
 */
export function AppShell({ shell, children }: { shell: ShellContext; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar allowedHrefs={shell.allowedHrefs} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header shell={shell} />
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <div className="mb-4">
              <Breadcrumbs />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
