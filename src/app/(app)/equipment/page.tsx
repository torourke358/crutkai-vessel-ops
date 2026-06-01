import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { todayLocal } from "@/lib/format";
import { computeDueState, isDueSoon } from "@/lib/maintenance";
import EquipmentList, { type EquipmentRow } from "@/components/EquipmentList";
import type { Component, DueType, VesselZone } from "@/lib/types";

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
  ga_x: number | null;
  ga_y: number | null;
  component_id: string | null;
  zone_id: string | null;
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

  const [
    { data: rows },
    { data: components },
    { data: zones },
    { data: tasks },
  ] = await Promise.all([
    supabase
      .from("equipment")
      .select(
        "id, name, make, model, location_on_vessel, current_hours, active, critical, is_ism, is_isps, ga_x, ga_y, component_id, zone_id, component:components(name)",
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
      .from("vessel_zones")
      .select()
      .eq("active", true)
      .order("display_order")
      .returns<VesselZone[]>(),
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

  // Pinned units for the GA panel. Only active equipment with both
  // coordinates set; rose for Critical, violet otherwise.
  const pinned = (rows ?? []).filter(
    (r) => r.active && r.ga_x != null && r.ga_y != null,
  );
  const totalActive = (rows ?? []).filter((r) => r.active).length;

  // Group active equipment by zone for the box grid below the schematic.
  // Equipment without a zone falls into a synthetic "Unassigned" bucket.
  const byZone = new Map<string | "unassigned", RawRow[]>();
  for (const r of rows ?? []) {
    if (!r.active) continue;
    const key = r.zone_id ?? "unassigned";
    const arr = byZone.get(key) ?? [];
    arr.push(r);
    byZone.set(key, arr);
  }
  const zoneCards = (zones ?? [])
    .map((z) => ({ zone: z, items: byZone.get(z.id) ?? [] }))
    .filter(({ items }) => items.length > 0);
  const unassigned = byZone.get("unassigned") ?? [];

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

      {/* Vessel schematic with pinned equipment. Server-rendered so the
          dots show up without a client roundtrip. */}
      <section className="space-y-1">
        <div
          className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100"
          style={{ aspectRatio: "1000 / 520" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ga-schematic.svg"
            alt="Anne-Marie GA"
            className="block h-full w-full select-none"
            draggable={false}
          />
          {pinned.map((r) => (
            <Link
              key={r.id}
              href={`/equipment/${r.id}`}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${r.ga_x}%`, top: `${r.ga_y}%` }}
              aria-label={r.name}
            >
              <span
                className={`block h-3 w-3 rounded-full ring-2 ring-white shadow ${
                  r.critical ? "bg-rose-600" : "bg-violet-600"
                }`}
              />
              <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {r.name}
              </span>
            </Link>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          {pinned.length} of {totalActive} active units pinned ·{" "}
          <span className="text-rose-700">Critical</span> /{" "}
          <span className="text-violet-700">Non-critical</span> · Pin a unit
          via the &quot;Pin on GA&quot; widget on its edit form.
        </p>
      </section>

      {/* Zone cards — equipment grouped by physical part of the ship. Each
          zone is a small card with its name as the header and its equipment
          listed inside. Tap any row to open the unit's detail page. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">By zone</h2>
        {zoneCards.length === 0 && unassigned.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 ring-1 ring-slate-100">
            No equipment is assigned to a zone yet. Edit a unit and pick its
            zone from the Zone dropdown.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zoneCards.map(({ zone, items }) => (
              <ZoneCard key={zone.id} title={zone.name} items={items} />
            ))}
            {unassigned.length > 0 && (
              <ZoneCard
                key="unassigned"
                title="Unassigned"
                items={unassigned}
                muted
              />
            )}
          </div>
        )}
      </section>

      <EquipmentList rows={eqRows} components={components ?? []} />
    </div>
  );
}

function ZoneCard({
  title,
  items,
  muted = false,
}: {
  title: string;
  items: RawRow[];
  muted?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl ring-1 ${
        muted
          ? "bg-slate-50 ring-slate-100"
          : "bg-white ring-slate-100"
      }`}
    >
      <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-slate-400">{items.length}</span>
      </header>
      <ul className="divide-y divide-slate-100">
        {items.map((r) => (
          <li key={r.id}>
            <Link
              href={`/equipment/${r.id}`}
              className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1 truncate text-slate-900">
                {r.name}
                {r.critical && (
                  <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-rose-700">
                    Crit
                  </span>
                )}
              </span>
              {r.current_hours != null && (
                <span className="shrink-0 text-xs tabular-nums text-slate-400">
                  {r.current_hours} hrs
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
