import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { computeStatus, STATUS_LABELS } from "@/lib/inventory";

// Excel (.xlsx) export. All signed-in users can pull it — RLS still scopes
// the read. Mirrors petty cash's xlsx style: bold + filled + frozen header,
// auto-widths clamped, sentence-case header row. Components are joined into
// a single semicolon-separated cell since a row can carry up to 8.
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Thor · M/Y Anne-Marie";
  wb.created = new Date();

  const ws = wb.addWorksheet("Inventory", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

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
  ws.addRow(headers);

  // Track max content length per column for auto-width.
  const widths = headers.map((h) => h.length);
  const note = (i: number, v: unknown) => {
    const len = v == null ? 0 : String(v).length;
    if (len > widths[i]) widths[i] = len;
  };

  for (const r of data) {
    const status = computeStatus(r.quantity, r.critical_threshold);
    const componentNames = (r.component_ids ?? [])
      .map((id) => nameById.get(id))
      .filter(Boolean)
      .join("; ");

    const values: (string | number | null)[] = [
      r.part_name,
      r.part_number ?? "",
      r.make ?? "",
      r.quantity,
      r.unit,
      r.location ?? "",
      componentNames,
      r.critical_threshold ?? null,
      STATUS_LABELS[status],
      r.notes ?? "",
    ];
    const row = ws.addRow(values);
    row.getCell(4).numFmt = "0";  // Quantity
    row.getCell(8).numFmt = "0";  // Critical threshold

    values.forEach((v, i) => note(i, v));
  }

  // Bold + slate-200 fill + frozen header row.
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  // Auto-widths, clamped so a long Notes cell doesn't blow out the sheet.
  ws.columns.forEach((col, i) => {
    col.width = Math.min(widths[i] + 2, i === 9 ? 60 : 30);
  });

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventory-${todayLocal()}.xlsx"`,
    },
  });
}
