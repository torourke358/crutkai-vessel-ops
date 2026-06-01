"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import SignOutButton from "@/components/SignOutButton";

const TABS: { href: string; label: string }[] = [
  { href: "/inventory", label: "Inventory" },
  { href: "/equipment", label: "Equipment" },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/yard", label: "Yard" },
  { href: "/reports", label: "Reports" },
];

// Header nav. Highlights whichever tab matches the current path so it's
// obvious where you are at a glance. Active = violet pill; inactive = the
// previous muted-slate link style.
export default function NavLinks({ role }: { role: "crew" | "admin" }) {
  const pathname = usePathname() ?? "/";

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const tabClass = (active: boolean) =>
    active
      ? "rounded-md bg-violet-100 px-2 py-1 font-semibold text-violet-700 ring-1 ring-violet-200"
      : "rounded-md px-2 py-1 text-slate-500 hover:text-violet-700";

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={tabClass(isActive(t.href))}>
          {t.label}
        </Link>
      ))}
      <NotificationBell />
      {role === "admin" && (
        <Link
          href="/admin/components"
          className={tabClass(isActive("/admin/components"))}
        >
          Systems
        </Link>
      )}
      <Link
        href="/account/password"
        className={tabClass(isActive("/account/password"))}
      >
        Password
      </Link>
      <SignOutButton />
    </nav>
  );
}
