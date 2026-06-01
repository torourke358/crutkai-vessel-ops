import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { todayLocal } from "@/lib/format";
import { computeDueState, isDueSoon } from "@/lib/maintenance";
import EquipmentList, { type EquipmentRow } from "@/components/EquipmentList";
import type { Component, DueType } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RawRow {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  location_on_vessel: string | null;
  current_hours: number | null;
  active: boolean;
  critical: boolean;
  is_ism: boolean;
  is_isps: boolean;
  component_id: string | null;
  component: { name: string } | null;
}

interface RawTask {
  equipment_id: string;
  due_type: DueType;
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
}

export default async function EquipmentPage() {
  const supabase = await createClient();
  const role = await getUserRole();
  const today = todayLocal();

  const [{ data: rows }, { data: components }, { data: tasks }] = await Promise.all([
    supabase
      .from("equipment")
      .select(
        "id, name, make, model, location_on_vessel, current_hours, active, critical, is_ism, is_isps, component_id, component:components(name)",
      )
      .order("name", { ascending: true })
      .returns<RawRow[]>(),
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
    supabase
      .from("maintenance_tasks")
      .select(
        "equipment_id, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done",
      )
      .eq("active", true)
      .returns<RawTask[]>(),
  ]);

  // Bucket tasks by equipment so we can compute the worst state per unit.
  const tasksByEq = new Map<string, RawTask[]>();
  for (const t of tasks ?? []) {
    const arr = tasksByEq.get(t.equipment_id) ?? [];
    arr.push(t);
    tasksByEq.set(t.equipment_id, arr);
  }

  const eqRows: EquipmentRow[] = (rows ?? []).map((r) => {
    const ts = tasksByEq.get(r.id) ?? [];
    let pmState: EquipmentRow["pmState"] = ts.length === 0 ? "none" : "ok";
    for (const t of ts) {
      const due = computeDueState(t, r.current_hours, today);
      if (due.state === "overdue") {
        pmState = "overdue";
        break; // overdue is the worst; no need to keep checking
      }
      if (due.state === "due") {
        pmState = "overdue"; // due-today is treated the same as overdue for the dashboard
        break;
      }
      if (isDueSoon(t, r.current_hours, today) && pmState !== "due_soon") {
        pmState = "due_soon";
      }
    }
    return {
      id: r.id,
      name: r.name,
      make: r.make,
      model: r.model,
      location_on_vessel: r.location_on_vessel,
      current_hours: r.current_hours,
      componentId: r.component_id,
      componentName: r.component?.name ?? null,
      active: r.active,
      critical: r.critical,
      is_ism: r.is_ism,
      is_isps: r.is_isps,
      pmState,
      taskCount: ts.length,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Equipment</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/equipment/log"
            className="font-medium text-slate-500 hover:text-violet-700"
          >
            Log hours
          </Link>
          {role === "admin" && (
            <Link
              href="/equipment/new"
              className="rounded-xl bg-violet-600 px-4 py-2 font-medium text-white active:bg-violet-700"
            >
              + New equipment
            </Link>
          )}
        </div>
      </div>
      <EquipmentList rows={eqRows} components={components ?? []} />
    </div>
  );
}
