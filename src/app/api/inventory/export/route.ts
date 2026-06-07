import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { computeStatus, STATUS_LABELS } from "@/lib/inventory";
import { csvResponse } from "@/lib/csv";

// CSV export of the full inventory list. All signed-in users can pull it — RLS
// still scopes the read. Apple Numbers (and Excel) read .csv natively.
// Components are joined into a single semicolon-separated cell since a row can
// carry up to 8.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: rows, error }, { data: comps }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(
        "part_name, part_number, make, quantity, unit, location, notes, critical_threshold, component_ids",
      )
      .order("part_name", { ascending: true })
      .returns<
        {
          part_name: string;
          part_number: string | null;
          make: string | null;
          quantity: number;
          unit: string;
          location: string | null;
          notes: string | null;
          critical_threshold: number | null;
          component_ids: string[];
        }[]
      >(),
    supabase.from("components").select("id, name"),
  ]);

  if (error) {
    console.error("inventory export failed", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }

  const nameById = new Map((comps ?? []).map((c) => [c.id, c.name] as const));
  const data = rows ?? [];

  const headers = [
    "Part name",
    "Part number",
    "Make",
    "Quantity",
    "Unit",
    "Location",
    "Components",
    "Critical threshold",
    "Status",
    "Notes",
  ];
  const dataRows = data.map((r) => {
    const status = computeStatus(r.quantity, r.critical_threshold);
    const componentNames = (r.component_ids ?? [])
      .map((id) => nameById.get(id))
      .filter(Boolean)
      .join("; ");
    return [
      r.part_name,
      r.part_number ?? "",
      r.make ?? "",
      r.quantity,
      r.unit,
      r.location ?? "",
      componentNames,
      r.critical_threshold ?? "",
      STATUS_LABELS[status],
      r.notes ?? "",
    ];
  });

  return csvResponse(`inventory-${todayLocal()}.csv`, headers, dataRows);
}
