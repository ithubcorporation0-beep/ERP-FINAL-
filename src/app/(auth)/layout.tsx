import { Logo } from "@/components/layout/logo";
import { siteConfig } from "@/config/site";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/60 px-4 py-10">
      <Logo href="/login" />
      {children}
      <p className="text-center text-xs text-muted-foreground">
        {siteConfig.name} · Access is restricted to authorized users.
      </p>
    </main>
  );
}
