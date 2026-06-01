import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import NotificationBell from "@/components/NotificationBell";
import NotificationBanner from "@/components/NotificationBanner";

// Protected shell for every signed-in screen. Server component: redirects to
// /login when there's no session (the proxy does this too, but this guards
// direct server renders).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getUserRole();

  // Persistent banner kinds: items requiring attention right now. Limit 5 so
  // the header doesn't take over the screen when alerts pile up; full list
  // is one tap away on /notifications.
  const { data: bannerRows } = await supabase
    .from("notifications")
    .select("id, kind, subject, body")
    .eq("recipient_id", user.id)
    .eq("channel", "in_app")
    .in("kind", ["inventory_critical", "maintenance_overdue"])
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-slate-900"
          >
            Thor
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500">
            <Link href="/inventory" className="hover:text-violet-700">
              Inventory
            </Link>
            <Link href="/equipment" className="hover:text-violet-700">
              Equipment
            </Link>
            <Link href="/maintenance" className="hover:text-violet-700">
              Maintenance
            </Link>
            <Link href="/reports" className="hover:text-violet-700">
              Reports
            </Link>
            <NotificationBell />
            {role === "admin" && (
              <Link href="/admin/components" className="hover:text-violet-700">
                Systems
              </Link>
            )}
            <Link href="/account/password" className="hover:text-violet-700">
              Password
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>

      <NotificationBanner initial={bannerRows ?? []} />

      <main
        className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
