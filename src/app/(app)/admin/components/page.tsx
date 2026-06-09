import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import ComponentsManager from "@/components/ComponentsManager";
import type { Component } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminComponentsPage() {
  if ((await getUserRole()) !== "admin") redirect("/");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("components")
    .select("id, code, name, display_order, active")
    .order("display_order", { ascending: true })
    .returns<Component[]>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Systems</h1>
        <Link href="/equipment" className="text-sm text-slate-500">
          Back to equipment
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Edit the systems list used everywhere on Runa — the System dropdown on
        equipment and the Related components picker on inventory both read from
        here.
      </p>
      <ComponentsManager initial={rows ?? []} />
    </div>
  );
}
