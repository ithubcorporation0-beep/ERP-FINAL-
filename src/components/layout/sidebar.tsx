import Link from "next/link";
import { NAVIGATION } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { logoutAction } from "@/server/actions/auth.actions";

export function Sidebar({ userName }: { userName: string }) {
  return (
    <aside style={{ width: 220, borderRight: "1px solid var(--border)", background: "var(--surface)", padding: 16 }}>
      <strong>{siteConfig.name}</strong>
      <nav style={{ display: "grid", gap: 4, marginTop: 16 }}>
        {NAVIGATION.map((item) => (
          <Link key={item.href} href={item.href} style={{ padding: "6px 8px", borderRadius: 6 }}>
            {item.label}
          </Link>
        ))}
      </nav>
      <form action={logoutAction} style={{ marginTop: 24, color: "var(--muted)", fontSize: 14 }}>
        <div>{userName}</div>
        <button type="submit">Sign out</button>
      </form>
    </aside>
  );
}
