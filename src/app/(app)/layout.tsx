import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import NotificationBell from "@/components/NotificationBell";

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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-slate-900"
          >
            Vessel Ops
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
            <Link href="/yard" className="hover:text-violet-700">
              Yard
            </Link>
            <NotificationBell />
            {role === "admin" && (
              <Link href="/admin/audit" className="hover:text-violet-700">
                Audit
              </Link>
            )}
            <Link href="/account/password" className="hover:text-violet-700">
              Password
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
    </div>
  );
}
