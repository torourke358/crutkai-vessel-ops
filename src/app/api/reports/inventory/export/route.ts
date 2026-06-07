import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { csvResponse } from "@/lib/csv";

interface Row {
  id: string;
  qty_used: number;
  recorded_at: string;
  recorded_by: string | null;
  source_type: "maintenance" | "yard";
  source_id: string;
  inventory_item: { part_name: string; unit: string; part_number: string | null } | null;
}

// GET /api/reports/inventory/export?from=YYYY-MM-DD&to=YYYY-MM-DD
// Inventory churn — every parts_consumed row in the range, the cross-module
// signal of what got pulled from stock.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? todayLocal();
  const to = url.searchParams.get("to") ?? todayLocal();
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const [{ data: rows, error }, { data: users }] = await Promise.all([
    supabase
      .from("parts_consumed")
      .select(
        "id, qty_used, recorded_at, recorded_by, source_type, source_id, inventory_item:inventory_items(part_name, unit, part_number)",
      )
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: false })
      .returns<Row[]>(),
    supabase.from("user_profiles").select("id, full_name"),
  ]);

  if (error) {
    console.error("inventory churn export failed", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const));

  const headers = [
    "Date",
    "Part",
    "Part number",
    "Qty used",
    "Unit",
    "Source",
    "Recorded by",
  ];
  const dataRows: (string | number)[][] = (rows ?? []).map((r) => [
    r.recorded_at.slice(0, 10),
    r.inventory_item?.part_name ?? "(deleted item)",
    r.inventory_item?.part_number ?? "",
    r.qty_used,
    r.inventory_item?.unit ?? "Units",
    r.source_type,
    r.recorded_by ? nameById.get(r.recorded_by) ?? "Unknown" : "—",
  ]);

  // Total row mirrors the old xlsx export.
  const total = (rows ?? []).reduce((s, r) => s + r.qty_used, 0);
  dataRows.push(["", "TOTAL", "", total, "", "", ""]);

  return csvResponse(`inventory-churn-${from}-to-${to}.csv`, headers, dataRows);
}
