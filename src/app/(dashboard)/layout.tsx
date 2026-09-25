import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-svh">
      <Sidebar userName={user.name} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
