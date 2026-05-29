import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import EquipmentList, { type EquipmentRow } from "@/components/EquipmentList";
import type { Component } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RawRow {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  location_on_vessel: string | null;
  current_hours: number | null;
  active: boolean;
  component_id: string | null;
  component: { name: string } | null;
}

export default async function EquipmentPage() {
  const supabase = await createClient();
  const role = await getUserRole();

  const [{ data: rows }, { data: components }] = await Promise.all([
    supabase
      .from("equipment")
      .select(
        "id, name, make, model, location_on_vessel, current_hours, active, component_id, component:components(name)",
      )
      .order("name", { ascending: true })
      .returns<RawRow[]>(),
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
  ]);

  const eqRows: EquipmentRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    make: r.make,
    model: r.model,
    location_on_vessel: r.location_on_vessel,
    current_hours: r.current_hours,
    componentId: r.component_id,
    componentName: r.component?.name ?? null,
    active: r.active,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Equipment</h1>
        {role === "admin" && (
          <Link
            href="/equipment/new"
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700"
          >
            + New equipment
          </Link>
        )}
      </div>
      <EquipmentList rows={eqRows} components={components ?? []} />
    </div>
  );
}
