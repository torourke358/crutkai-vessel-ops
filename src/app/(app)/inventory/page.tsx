import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import InventoryList, { type InventoryRow } from "@/components/InventoryList";
import type { Component } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RawRow {
  id: string;
  part_name: string;
  part_number: string | null;
  make: string | null;
  quantity: number;
  unit: string;
  location: string | null;
  notes: string | null;
  critical_threshold: number | null;
  related_component_id: string | null;
  component: { code: string; name: string } | null;
}

export default async function InventoryPage() {
  const supabase = await createClient();
  const role = await getUserRole();

  const [{ data: items }, { data: components }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(
        "id, part_name, part_number, make, quantity, unit, location, notes, critical_threshold, related_component_id, component:components(code, name)",
      )
      .order("part_name", { ascending: true })
      .returns<RawRow[]>(),
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
  ]);

  const rows: InventoryRow[] = (items ?? []).map((r) => ({
    id: r.id,
    part_name: r.part_name,
    part_number: r.part_number,
    make: r.make,
    quantity: r.quantity,
    unit: r.unit,
    location: r.location,
    notes: r.notes,
    critical_threshold: r.critical_threshold,
    componentId: r.related_component_id,
    componentCode: r.component?.code ?? null,
    componentName: r.component?.name ?? null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Inventory</h1>
        <div className="flex items-center gap-3 text-sm">
          {/* CSV download needs a real navigation so Content-Disposition fires.
              Next's <Link> would client-side-route it. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/inventory/export"
            className="font-medium text-slate-500 hover:text-violet-700"
          >
            Export CSV
          </a>
          {role === "admin" && (
            <>
              <Link
                href="/inventory/bulk-thresholds"
                className="font-medium text-slate-500 hover:text-violet-700"
              >
                Bulk thresholds
              </Link>
              <Link
                href="/inventory/new"
                className="rounded-xl bg-violet-600 px-4 py-2 font-medium text-white active:bg-violet-700"
              >
                + New item
              </Link>
            </>
          )}
        </div>
      </div>

      <InventoryList
        rows={rows}
        components={components ?? []}
        isAdmin={role === "admin"}
      />
    </div>
  );
}
