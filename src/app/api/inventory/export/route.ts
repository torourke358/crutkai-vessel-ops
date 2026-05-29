import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { computeStatus, STATUS_LABELS } from "@/lib/inventory";

// CSV export. All signed-in users can pull it — RLS still scopes the read,
// and there's no sensitive PII here.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("inventory_items")
    .select(
      "part_name, part_number, make, quantity, unit, location, notes, critical_threshold, component:components(name)",
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
        component: { name: string } | null;
      }[]
    >();

  if (error) {
    console.error("inventory export failed", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }

  const headers = [
    "Part name",
    "Part number",
    "Make",
    "Quantity",
    "Unit",
    "Location",
    "Component",
    "Critical threshold",
    "Status",
    "Notes",
  ];

  const lines: string[] = [headers.map(csvCell).join(",")];
  for (const r of rows ?? []) {
    const status = computeStatus(r.quantity, r.critical_threshold);
    lines.push(
      [
        csvCell(r.part_name),
        csvCell(r.part_number ?? ""),
        csvCell(r.make ?? ""),
        csvCell(r.quantity),
        csvCell(r.unit),
        csvCell(r.location ?? ""),
        csvCell(r.component?.name ?? ""),
        csvCell(r.critical_threshold ?? ""),
        csvCell(STATUS_LABELS[status]),
        csvCell(r.notes ?? ""),
      ].join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-${todayLocal()}.csv"`,
    },
  });
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
