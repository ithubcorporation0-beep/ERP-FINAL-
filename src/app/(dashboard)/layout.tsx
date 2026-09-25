import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar userName={user.name} />
      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
