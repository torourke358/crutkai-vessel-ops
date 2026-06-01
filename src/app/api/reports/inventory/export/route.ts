import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";

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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Thor · M/Y Anne-Marie";
  wb.created = new Date();

  const ws = wb.addWorksheet("Inventory churn", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Date",
    "Part",
    "Part number",
    "Qty used",
    "Unit",
    "Source",
    "Recorded by",
  ];
  ws.addRow(headers);

  const widths = headers.map((h) => h.length);
  const note = (i: number, v: unknown) => {
    const len = v == null ? 0 : String(v).length;
    if (len > widths[i]) widths[i] = len;
  };

  let total = 0;
  for (const r of rows ?? []) {
    const values: (string | number | Date | null)[] = [
      new Date(r.recorded_at),
      r.inventory_item?.part_name ?? "(deleted item)",
      r.inventory_item?.part_number ?? "",
      r.qty_used,
      r.inventory_item?.unit ?? "Units",
      r.source_type,
      r.recorded_by ? nameById.get(r.recorded_by) ?? "Unknown" : "—",
    ];
    const row = ws.addRow(values);
    row.getCell(1).numFmt = "mm/dd/yyyy";
    row.getCell(4).numFmt = "0";
    total += r.qty_used;
    values.forEach((v, i) => note(i, v));
  }

  // Total row.
  const totalRow = ws.addRow(["", "TOTAL", "", total, "", "", ""]);
  totalRow.font = { bold: true };
  totalRow.getCell(4).numFmt = "0";

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  ws.columns.forEach((col, i) => {
    col.width = Math.min(widths[i] + 2, 30);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventory-churn-${from}-to-${to}.xlsx"`,
    },
  });
}
